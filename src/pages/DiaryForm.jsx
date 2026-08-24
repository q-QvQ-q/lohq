import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase } from '../supabase/client.js'

const MOODS = [
  { value: 'happy', emoji: '😊', label: '开心', color: '#FFD93D' },
  { value: 'sweet', emoji: '🥰', label: '甜蜜', color: '#FFB5C5' },
  { value: 'normal', emoji: '😐', label: '一般', color: '#B8C4D0' },
  { value: 'sad', emoji: '😢', label: '难过', color: '#6B9BFF' },
  { value: 'angry', emoji: '😤', label: '生气', color: '#FF6B6B' }
]

export default function DiaryForm() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('normal')
  const [images, setImages] = useState([])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!content.trim()) {
      alert('写点什么吧~')
      return
    }
    if (!profile?.id) {
      alert('请先登录')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('diaries')
        .insert({
          author_id: profile.id,
          mood,
          content: content.trim(),
          images: images.length > 0 ? images : null
        })
      if (error) throw error
      navigate('/diaries')
    } catch (err) {
      alert('发布失败: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    
    try {
      const newUrls = []
      for (const file of files) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`
        
        const { data, error } = await supabase.storage
          .from('photos')
          .upload(`diaries/${fileName}`, file)
        
        if (error) throw error
        
        const { data: urlData } = supabase.storage
          .from('photos')
          .getPublicUrl(`diaries/${fileName}`)
        
        if (urlData?.publicUrl) {
          newUrls.push(urlData.publicUrl)
        }
      }
      setImages([...images, ...newUrls])
    } catch (err) {
      console.error('图片上传失败:', err)
      alert('图片上传失败: ' + err.message)
    }
    e.target.value = ''
  }

  function removeImage(index) {
    setImages(images.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (!content.trim() && images.length === 0) {
              navigate(-1)
            } else if (confirm('有未保存的内容，确定要离开吗？')) {
              navigate(-1)
            }
          }}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          <span>✏️</span> 写日记
        </h1>
        <div style={{ width: '50px' }}></div>
      </div>

      {/* Mood Selection */}
      <div className="card">
        <label className="label-text mb-3 block">今天的心情</label>
        <div className="flex justify-between gap-2">
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMood(m.value)}
              className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                mood === m.value ? 'ring-2 scale-105' : 'opacity-60 hover:opacity-80'
              }`}
              style={{
                backgroundColor: mood === m.value ? m.color + '40' : 'var(--color-primary-light)',
                borderColor: m.color
              }}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Input */}
      <div className="card">
        <label className="label-text mb-3 block">写点什么</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记录今天的美好时刻、想对宝宝说的话..."
          className="input-field w-full min-h-[150px] resize-none"
          style={{ 
            padding: '0.75rem',
            lineHeight: 1.6
          }}
        />
      </div>

      {/* Images */}
      <div className="card">
        <label className="label-text mb-3 block">添加图片（可选）</label>
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {images.map((url, idx) => (
              <div key={idx} className="relative">
                <img
                  src={url}
                  alt={`图片${idx + 1}`}
                  className="w-full aspect-square object-cover rounded-lg"
                />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          <div className="flex items-center justify-center gap-2 p-3 rounded-input border-2 border-dashed transition-all hover:opacity-70"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text-light)' }}
          >
            <span>📷</span>
            <span className="text-sm">点击上传图片</span>
          </div>
        </label>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        className="btn-primary w-full py-3 text-lg"
        disabled={submitting}
      >
        {submitting ? '发布中...' : '💕 发布日记'}
      </button>
    </div>
  )
}