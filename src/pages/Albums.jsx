import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { formatTime } from '../utils/dateUtils.js'

const SIGNED_URL_TTL = 604800 // 7天有效期，减少重新生成次数

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
          .select('album_id')
      ])
      
      if (!albumsData || albumsData.length === 0) {
        setAlbums([])
        return
      }
      
      const countMap = {}
      ;(photosResult.data || []).forEach(p => {
        countMap[p.album_id] = (countMap[p.album_id] || 0) + 1
      })
      
      const albumsWithCount = albumsData.map(album => ({
        ...album,
        photo_count: countMap[album.id] || 0
      }))
      
      setAlbums(albumsWithCount)
    } catch (err) {
      console.error('加载相册失败:', err)
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPhotos(albumId) {
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('album_id', albumId)
        .order('uploaded_at', { ascending: false })
        .limit(60)
      if (error) throw error
      
      if (!data || data.length === 0) {
        setPhotos([])
        return
      }
      
      // 检查哪些照片已有有效签名URL，哪些需要生成
      const hasValidUrl = []
      const needSign = []
      
      data.forEach(photo => {
        const existingUrl = photo.url || ''
        const isValidUrl = existingUrl.startsWith('http') && 
                          (existingUrl.includes('token') || !existingUrl.includes('signedUrl'))
        const cached = photo.file_path ? signedUrlCache.current.get(photo.file_path) : null
        
        if (isValidUrl || (cached && cached.expireAt > Date.now())) {
          hasValidUrl.push({ photo, cachedUrl: cached?.url })
        } else if (photo.file_path) {
          needSign.push(photo)
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
          .createSignedUrls(filePaths, SIGNED_URL_TTL)
        
        if (signedUrlsError) {
          console.warn('批量签名URL生成失败:', signedUrlsError)
          // 生成失败也显示，用空URL让浏览器显示占位
          const failedPhotos = needSign.map(p => ({ ...p, signed_url: '' }))
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
          
          // 异步持久化签名URL到数据库，下次打开瞬间加载
          signedPhotos.forEach(photo => {
            if (photo.signed_url) {
              supabase
                .from('photos')
                .update({ url: photo.signed_url })
                .eq('id', photo.id)
                .catch(() => {})  // 静默失败
            }
          })
        }
      }
    } catch (err) {
      console.error('加载照片失败:', err)
      alert('加载失败: ' + err.message)
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
            // 上传后立即生成签名URL并存入数据库，下次直接使用
            const { data: signData } = await supabase.storage
              .from('photos')
              .createSignedUrl(filePath, SIGNED_URL_TTL)
            
            const signedUrl = signData?.signedUrl || filePath
            
            const { error: insertError } = await supabase
              .from('photos')
              .insert({
                album_id: currentAlbum.id,
                url: signedUrl,  // 存签名URL，直接可用
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
    // 如果已有有效签名URL，直接显示
    if (photo.signed_url && photo.signed_url.startsWith('http')) {
      setViewerUrl(photo.signed_url)
      setViewerTime(photo.uploaded_at)
      return
    }
    
    // 否则生成签名URL（兼容旧数据）
    if (photo.file_path) {
      const cached = signedUrlCache.current.get(photo.file_path)
      if (cached && cached.expireAt > Date.now()) {
        setViewerUrl(cached.url)
        setViewerTime(photo.uploaded_at)
        return
      }
      
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
    loadPhotos(album.id)
  }

  function openRenameModal(album) {
    setEditingAlbum(album)
    setEditName(album.name)
    setShowRenameModal(true)
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">📷</span> 加载中...
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <span>🖼️</span> {showPhotoModal ? currentAlbum?.name || '相册' : '分类相册'}
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
          💡 提示：点击相册可查看/上传照片。支持长按相册卡片进行改名或删除。
        </div>
      )}

      {/* Album Grid */}
      {!showPhotoModal && (
        <>
          {albums.length === 0 ? (
            <div className="card text-center py-16">
              <span className="text-5xl mb-4 block">📷</span>
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
                        <span className="text-4xl">📁</span>
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
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openRenameModal(album) }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      title="改名"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAlbum(album) }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      title="删除"
                    >
                      🗑️
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
              共 {photos.length} 张照片
            </p>
            <label className="btn-primary cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <span className="text-sm">📷 上传</span>
            </label>
          </div>

          {photos.length === 0 ? (
            <div className="card text-center py-12">
              <span className="text-4xl block mb-2">📷</span>
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
                      className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
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
            <div className="mt-4 px-4 py-2 rounded-full text-sm text-white" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              📷 {new Date(viewerTime).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}