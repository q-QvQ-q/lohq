import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { formatTime } from '../utils/dateUtils.js'
import Icon from '../components/Icon.jsx'

const SIGNED_URL_TTL = 604800 // 7天有效期，减少重新生成次数
const PHOTO_PAGE_SIZE = 60

function getStoragePath(photo) {
  if (photo?.file_path && !photo.file_path.startsWith('http')) return photo.file_path
  if (!photo?.url) return ''
  if (!photo.url.startsWith('http')) return photo.url

  const markers = [
    '/storage/v1/object/sign/photos/',
    '/storage/v1/object/public/photos/'
  ]
  const marker = markers.find(item => photo.url.includes(item))
  if (!marker) return ''

  const encodedPath = photo.url.split(marker)[1]?.split('?')[0] || ''
  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

export default function Albums() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix } = useDataCache()
  const signedUrlCache = useRef(new Map()) // 内存缓存，避免重复请求
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAlbumModal, setShowAlbumModal] = useState(false)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [currentAlbum, setCurrentAlbum] = useState(null)
  const [photos, setPhotos] = useState([])
  const [photoLimit, setPhotoLimit] = useState(PHOTO_PAGE_SIZE)
  const [photoTotal, setPhotoTotal] = useState(0)
  const [photoLoadError, setPhotoLoadError] = useState('')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [viewerUrl, setViewerUrl] = useState(null)
  const [viewerTime, setViewerTime] = useState(null)
  const [editingAlbum, setEditingAlbum] = useState(null)
  const [editName, setEditName] = useState('')
  const [showRenameModal, setShowRenameModal] = useState(false)

  useEffect(() => {
    loadAlbums()
  }, [profile?.id])

  async function loadAlbums() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const [albumsData, photosResult] = await Promise.all([
        fetchWithCache('albums', async () => {
          const { data } = await supabase
            .from('albums')
            .select('*')
            .order('created_at', { ascending: false })
          return data || []
        }),
        supabase
          .from('photos')
          .select('album_id, file_path, url, uploaded_at')
          .order('uploaded_at', { ascending: false })
      ])
      
      if (!albumsData || albumsData.length === 0) {
        setAlbums([])
        return
      }
      
      const countMap = {}
      const latestPhotoMap = {}
      ;(photosResult.data || []).forEach(p => {
        countMap[p.album_id] = (countMap[p.album_id] || 0) + 1
        if (!latestPhotoMap[p.album_id]) latestPhotoMap[p.album_id] = p
      })

      const coverMap = {}
      const coversToSign = albumsData
        .map(album => ({ albumId: album.id, path: getStoragePath(latestPhotoMap[album.id]) }))
        .filter(item => item.path)

      if (coversToSign.length > 0) {
        const { data: signedCovers } = await supabase.storage
          .from('photos')
          .createSignedUrls(coversToSign.map(item => item.path), SIGNED_URL_TTL, {
            transform: { width: 480, height: 480, resize: 'cover', quality: 70 }
          })
        ;(signedCovers || []).forEach((item, index) => {
          coverMap[coversToSign[index]?.albumId] = item.signedUrl || ''
        })
      }
      
      const albumsWithCount = albumsData.map(album => ({
        ...album,
        photo_count: countMap[album.id] || 0,
        cover_url: coverMap[album.id]
          || (album.cover_url?.startsWith('http') && !album.cover_url.includes('/storage/v1/object/sign/') ? album.cover_url : '')
      }))
      
      setAlbums(albumsWithCount)
    } catch (err) {
      console.error('加载相册失败:', err)
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPhotos(albumId, limit = photoLimit) {
    setPhotoLoadError('')
    try {
      const { data, error, count } = await supabase
        .from('photos')
        .select('*', { count: 'exact' })
        .eq('album_id', albumId)
        .order('uploaded_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      setPhotoTotal(count || 0)
      
      if (!data || data.length === 0) {
        setPhotos([])
        return
      }
      
      // 检查哪些照片已有有效签名URL，哪些需要生成
      const hasValidUrl = []
      const needSign = []
      
      data.forEach(photo => {
        const stablePath = getStoragePath(photo)
        const normalizedPhoto = stablePath ? { ...photo, file_path: stablePath } : photo
        const cached = stablePath ? signedUrlCache.current.get(stablePath) : null

        // Signed URLs expire. Only reuse one whose expiry is known in this session;
        // persisted signed URLs from an earlier session must be regenerated.
        if (stablePath) {
          if (cached && cached.expireAt > Date.now()) {
            hasValidUrl.push({ photo: normalizedPhoto, cachedUrl: cached.url })
          } else {
            needSign.push(normalizedPhoto)
          }
        } else if (photo.url?.startsWith('http')) {
          // Compatibility with genuinely external image URLs.
          hasValidUrl.push({ photo, cachedUrl: photo.url })
        }
      })
      
      // 先显示已有URL的照片 + 骨架屏（新照片等签名生成后替换）
      const skeletonPhotos = needSign.map((p, i) => ({
        ...p,
        signed_url: '__loading__'  // 标记为加载中
      }))
      
      const readyPhotos = hasValidUrl.map(({ photo, cachedUrl }) => ({
        ...photo,
        signed_url: cachedUrl || photo.url
      }))
      
      // 合并：已就绪的 + 骨架屏
      const merged = [...readyPhotos, ...skeletonPhotos]
        .sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))
        .reverse()
      setPhotos(merged)
      
      // 为需要签名的照片批量生成URL（仅一次网络请求）
      if (needSign.length > 0) {
        const filePaths = needSign.map(p => p.file_path)
        const { data: signedUrlsData, error: signedUrlsError } = await supabase.storage
          .from('photos')
          .createSignedUrls(filePaths, SIGNED_URL_TTL, {
            // The grid never needs original camera-resolution images.
            transform: { width: 480, height: 480, resize: 'cover', quality: 70 }
          })
        
        if (signedUrlsError) {
          console.warn('批量签名URL生成失败:', signedUrlsError)
          const failedPhotos = needSign.map(p => ({ ...p, signed_url: '', load_error: true }))
          setPhotos(prev => {
            const map = {}
            failedPhotos.forEach(p => { map[p.id] = p })
            return prev.map(p => map[p.id] || p)
          })
        } else {
          const expireAt = Date.now() + SIGNED_URL_TTL * 1000
          const urlMap = {}
          ;(signedUrlsData || []).forEach(item => {
            urlMap[item.path] = item.signedUrl
            signedUrlCache.current.set(item.path, { url: item.signedUrl, expireAt })
          })
          
          // 用真实签名URL替换骨架屏
          const signedPhotos = needSign.map(photo => ({
            ...photo,
            signed_url: urlMap[photo.file_path] || ''
          }))
          
          setPhotos(prev => {
            const map = {}
            signedPhotos.forEach(p => { map[p.id] = p })
            return prev.map(p => map[p.id] || p)
          })
          
        }
      }
    } catch (err) {
      console.error('加载照片失败:', err)
      setPhotoLoadError(err.message || '照片加载失败')
    }
  }

  async function createAlbum() {
    if (!newAlbumName.trim()) {
      alert('请输入相册名称')
      return
    }
    try {
      const { error } = await supabase
        .from('albums')
        .insert({
          name: newAlbumName.trim(),
          created_by: profile.id
        })
      if (error) throw error
      setNewAlbumName('')
      setShowAlbumModal(false)
      invalidateByPrefix('albums')
      await loadAlbums()
    } catch (err) {
      alert('创建失败: ' + err.message)
    }
  }

  async function renameAlbum() {
    if (!editingAlbum || !editName.trim()) return
    try {
      const { error } = await supabase
        .from('albums')
        .update({ name: editName.trim() })
        .eq('id', editingAlbum.id)
      if (error) throw error
      setEditingAlbum(null)
      setShowRenameModal(false)
      invalidateByPrefix('albums')
      await loadAlbums()
    } catch (err) {
      alert('改名失败: ' + err.message)
    }
  }

  async function deleteAlbum(album) {
    if (!confirm(`确定删除相册"${album.name}"吗？相册内所有照片也会被删除！`)) return
    try {
      // 先删除相册中的所有照片
      const { data: photos } = await supabase
        .from('photos')
        .select('*')
        .eq('album_id', album.id)
      
      for (const photo of photos || []) {
        // 尝试删除存储中的文件（使用file_path）
        try {
          const filePath = photo.file_path || photo.url
          if (filePath && !filePath.startsWith('http')) {
            await supabase.storage.from('photos').remove([filePath])
          }
        } catch (e) {
          // 存储删除失败，忽略（可能已被删除）
        }
      }
      
      // 删除照片记录
      await supabase
        .from('photos')
        .delete()
        .eq('album_id', album.id)
      
      // 删除相册
      const { error } = await supabase
        .from('albums')
        .delete()
        .eq('id', album.id)
      if (error) throw error
      
      invalidateByPrefix('albums')
      await loadAlbums()
    } catch (err) {
      console.error('删除相册失败:', err)
      alert('删除失败: ' + err.message)
    }
  }

  async function handlePhotoUpload(e) {
    if (!currentAlbum) return
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    
    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`
        const filePath = `albums/${currentAlbum.id}/${fileName}`
        
        try {
          const { data, error } = await supabase.storage
            .from('photos')
            .upload(filePath, file)
          if (error) {
            alert('上传失败: ' + error.message)
          } else {
            const { error: insertError } = await supabase
              .from('photos')
              .insert({
                album_id: currentAlbum.id,
                // Display URLs are generated in memory because signed URLs expire.
                url: filePath,
                file_path: filePath,
                uploaded_by: profile.id
              })
            if (insertError) throw insertError
          }
        } catch (uploadErr) {
          console.error('单张照片上传失败:', uploadErr)
        }
      }
      await loadPhotos(currentAlbum.id)
      await loadAlbums()
    } catch (err) {
      console.error('上传失败:', err)
      alert('上传失败: ' + err.message)
    }
    e.target.value = ''
  }

  async function deletePhoto(id, photo) {
    if (!confirm('确定删除这张照片吗？')) return
    try {
      // 尝试从存储中删除（使用file_path）
      try {
        const filePath = photo.file_path || photo.url
        if (filePath && !filePath.startsWith('http')) {
          await supabase.storage.from('photos').remove([filePath])
        }
      } catch (e) {
        // 存储删除失败，忽略（可能已被删除）
      }
      
      // 从数据库删除
      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('albums')
      await loadPhotos(currentAlbum.id)
      await loadAlbums()
    } catch (err) {
      console.error('删除失败:', err)
      alert('删除失败: ' + err.message)
    }
  }

  function openPhotoViewer(photo) {
    // The grid uses a small transformed preview. Always issue a fresh URL for
    // the viewer so it can show the original image at full resolution.
    if (photo.file_path) {
      supabase.storage
        .from('photos')
        .createSignedUrl(photo.file_path, SIGNED_URL_TTL)
        .then(({ data, error }) => {
          if (!error && data?.signedUrl) {
            signedUrlCache.current.set(photo.file_path, { url: data.signedUrl, expireAt: Date.now() + SIGNED_URL_TTL * 1000 })
            setViewerUrl(data.signedUrl)
          }
        })
        .catch(() => {})
    }
    setViewerTime(photo.uploaded_at)
  }

  function openAlbum(album) {
    setCurrentAlbum(album)
    setShowPhotoModal(true)
    setPhotoLimit(PHOTO_PAGE_SIZE)
    loadPhotos(album.id, PHOTO_PAGE_SIZE)
  }

  function loadMorePhotos() {
    if (!currentAlbum) return
    const nextLimit = photoLimit + PHOTO_PAGE_SIZE
    setPhotoLimit(nextLimit)
    loadPhotos(currentAlbum.id, nextLimit)
  }

  function openRenameModal(album) {
    setEditingAlbum(album)
    setEditName(album.name)
    setShowRenameModal(true)
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="glass-pill fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs flex items-center gap-2">
          <Icon name="image" size={16} /> 加载中...
        </div>
      )}
      {/* Header */}
      <div className="feature-page-header flex items-center justify-between">
        <button
          onClick={() => {
            if (showPhotoModal) {
              setShowPhotoModal(false)
              setCurrentAlbum(null)
            } else {
              navigate(-1)
            }
          }}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> {showPhotoModal ? '返回相册' : '返回'}
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          <Icon name="image" size={21} /> {showPhotoModal ? currentAlbum?.name || '相册' : '分类相册'}
        </h1>
        {!showPhotoModal && (
          <button
            onClick={() => setShowAlbumModal(true)}
            className="btn-primary text-sm"
          >
            + 新建
          </button>
        )}
        {showPhotoModal && <div style={{ width: '50px' }}></div>}
      </div>

      {/* 提示信息 */}
      {!showPhotoModal && albums.length > 0 && (
        <div className="card text-xs" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-text-light)' }}>
          提示：点击相册可查看/上传照片。支持长按相册卡片进行改名或删除。
        </div>
      )}

      {/* Album Grid */}
      {!showPhotoModal && (
        <>
          {albums.length === 0 ? (
            <div className="card text-center py-16">
              <Icon name="image" size={32} className="mx-auto mb-4" />
              <p style={{ color: 'var(--color-text-light)' }}>还没有相册哦</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                点击右上角"新建"创建相册
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {albums.map(album => (
                <div key={album.id} className="card p-0 overflow-hidden relative group">
                  <button
                    onClick={() => openAlbum(album)}
                    className="w-full text-left"
                  >
                    <div 
                      className="aspect-square flex items-center justify-center"
                      style={{ backgroundColor: 'var(--color-primary-light)' }}
                    >
                      {album.cover_url ? (
                        <img src={album.cover_url} alt={album.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <Icon name="image" size={26} />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{album.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {album.photo_count} 张照片
                      </p>
                    </div>
                  </button>
                  {/* 操作按钮 */}
                  <div className="absolute top-1 right-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openRenameModal(album) }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      title="改名"
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAlbum(album) }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      title="删除"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Photo Grid */}
      {showPhotoModal && currentAlbum && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              共 {photoTotal} 张照片
            </p>
            <label className="btn-primary cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <span className="text-sm inline-flex items-center gap-1"><Icon name="image" size={16} />上传</span>
            </label>
          </div>

          {photoLoadError && (
            <div className="card text-center py-4">
              <p className="text-sm mb-2" style={{ color: '#E74C3C' }}>照片加载失败：{photoLoadError}</p>
              <button type="button" className="btn-secondary text-xs" onClick={() => loadPhotos(currentAlbum.id, photoLimit)}>
                重新加载
              </button>
            </div>
          )}

          {!photoLoadError && photos.length === 0 ? (
            <div className="card text-center py-12">
              <Icon name="image" size={28} className="mx-auto mb-2" />
              <p style={{ color: 'var(--color-text-light)' }}>还没有照片</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                点击上面的"上传"按钮添加照片
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map(photo => (
                <div key={photo.id} className="relative group">
                  {photo.signed_url === '__loading__' ? (
                    <div className="w-full aspect-square rounded-lg animate-pulse" 
                         style={{ backgroundColor: 'var(--color-primary-light)' }} />
                  ) : !photo.signed_url ? (
                    <button
                      type="button"
                      onClick={() => loadPhotos(currentAlbum.id, photoLimit)}
                      className="w-full aspect-square rounded-lg flex flex-col items-center justify-center text-xs"
                      style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-text-light)' }}
                    >
                      <span className="text-xl mb-1">↻</span>
                      加载失败，点此重试
                    </button>
                  ) : (
                    <img
                    src={photo.signed_url}
                    alt="照片"
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 bg-gray-100"
                    onClick={() => photo.signed_url && openPhotoViewer(photo)}
                    onError={(e) => {
                      e.target.style.opacity = '0.3'
                      e.target.style.transition = 'opacity 0.3s'
                    }}
                  />
                  )}
                  {/* 上传时间 - 悬停显示 */}
                  {photo.signed_url !== '__loading__' && photo.signed_url && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 p-1 rounded-b-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                    >
                      {formatTime(photo.uploaded_at)}
                    </div>
                  )}
                  {photo.signed_url !== '__loading__' && (
                    <button
                      onClick={() => deletePhoto(photo.id, photo)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                    >
                      <Icon name="x" size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {photos.length < photoTotal && (
            <button type="button" onClick={loadMorePhotos} className="w-full btn-secondary text-sm mt-3">
              加载更多（还有 {photoTotal - photos.length} 张）
            </button>
          )}
        </>
      )}

      {/* Create Album Modal */}
      {showAlbumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              创建相册
            </h3>
            <input
              type="text"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="相册名称（如：旅行、日常）"
              className="input-field"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowAlbumModal(false)}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={createAlbum}
                className="btn-primary flex-1"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Album Modal */}
      {showRenameModal && editingAlbum && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              改名相册
            </h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="新相册名称"
              className="input-field"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowRenameModal(false); setEditingAlbum(null); }}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={renameAlbum}
                className="btn-primary flex-1"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer */}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 cursor-pointer"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
          onClick={() => { setViewerUrl(null); setViewerTime(null); }}
        >
          <img
            src={viewerUrl}
            alt="查看照片"
            decoding="async"
            className="max-w-full max-h-[85vh] object-contain"
            onError={(e) => { e.target.style.opacity = '0.5' }}
          />
          {viewerTime && (
            <div className="glass-pill mt-4 px-4 py-2 text-sm text-white" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Icon name="calendar" size={14} className="inline mr-1" />{new Date(viewerTime).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
