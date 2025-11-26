'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './RegistrationModal.module.css'

export default function RegistrationModal({ isOpen, onClose }) {
  const { userId, callApi, showAlert } = useApp()
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    bankName: ''
  })
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Фокус на первое поле при открытии
      setTimeout(() => {
        const firstInput = document.querySelector(`.${styles.input}`)
        if (firstInput) firstInput.focus()
      }, 100)
    } else {
      // Очищаем форму при закрытии
      setFormData({
        name: '',
        phone: '',
        bankName: ''
      })
      setAvatar(null)
      setAvatarPreview(null)
    }
  }, [isOpen])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handlePhoneChange = (value) => {
    // Форматируем номер телефона
    let formatted = value.replace(/\D/g, '')
    if (formatted.startsWith('8')) {
      formatted = '7' + formatted.slice(1)
    }
    if (formatted.startsWith('7')) {
      formatted = formatted.slice(0, 11)
      if (formatted.length > 1) {
        formatted = `+7 ${formatted.slice(1, 4)} ${formatted.slice(4, 7)} ${formatted.slice(7, 9)} ${formatted.slice(9, 11)}`.trim()
      } else {
        formatted = '+7'
      }
    }
    handleInputChange('phone', formatted)
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Проверяем размер файла (максимум 5 МБ для аватарки)
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 МБ
    if (file.size > MAX_FILE_SIZE) {
      await showAlert('Ошибка', 'Размер файла не должен превышать 5 МБ')
      return
    }

    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
      await showAlert('Ошибка', 'Выберите изображение')
      return
    }

    setAvatar(file)
    
    // Создаем preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAvatar = () => {
    setAvatar(null)
    setAvatarPreview(null)
    // Сбрасываем input
    const input = document.querySelector(`.${styles.avatarInput}`)
    if (input) input.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      await showAlert('Ошибка', 'Введите ваше имя')
      return
    }

    if (!formData.phone.trim()) {
      await showAlert('Ошибка', 'Введите номер телефона')
      return
    }

    if (!formData.bankName.trim()) {
      await showAlert('Ошибка', 'Введите название банка')
      return
    }

    setIsSubmitting(true)

    try {
      // Очищаем номер телефона от форматирования
      const cleanPhone = formData.phone.replace(/\D/g, '')

      // Создаем FormData для отправки с аватаркой
      const formDataToSend = new FormData()
      formDataToSend.append('action', 'registerUser')
      formDataToSend.append('telegram_id', userId)
      formDataToSend.append('username', formData.name.trim())
      formDataToSend.append('role', 'logistic')
      formDataToSend.append('phone_number', cleanPhone)
      formDataToSend.append('bank_name', formData.bankName.trim())
      
      // Добавляем аватарку если есть
      if (avatar) {
        formDataToSend.append('avatar', avatar)
      }

      // Отправляем FormData напрямую на API
      const API_URL = "https://zaaiwvnohyupxajurnrn.supabase.co/functions/v1/smart-api"
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphYWl3dm5vaHl1cHhhanVybnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MDgwNTUsImV4cCI6MjA3MzA4NDA1NX0.IaQjZ-oxkFzIhiTsACXOEZxL5kAzXh-CdmsDBZth8bI"
      
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
          "x-client-info": "shabashka-frontend"
        },
        body: formDataToSend
      }).then(r => r.json())

      if (resp?.success) {
        // Сразу перезагружаем страницу без показа алерта
        window.location.reload()
      } else {
        await showAlert('Ошибка', resp?.error || 'Ошибка при регистрации')
      }
    } catch (error) {
      console.error('[RegistrationModal] Ошибка регистрации:', error)
      await showAlert('Ошибка', 'Ошибка при регистрации: ' + (error.message || 'Неизвестная ошибка'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h1 className={styles.logo}>ТРУВО</h1>
          <p className={styles.beta}>beta</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Введите ваше имя:</label>
            <input
              type="text"
              className={styles.input}
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Иван"
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Введите ваш номер телефона:</label>
            <input
              type="tel"
              className={styles.input}
              value={formData.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="+7 666 456 23 33"
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Название банка:</label>
            <input
              type="text"
              className={styles.input}
              value={formData.bankName}
              onChange={(e) => handleInputChange('bankName', e.target.value)}
              placeholder="Сбербанк"
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Аватарка (опционально):</label>
            {avatarPreview ? (
              <div className={styles.avatarPreviewContainer}>
                <img src={avatarPreview} alt="Preview" className={styles.avatarPreview} />
                <button
                  type="button"
                  className={styles.removeAvatarButton}
                  onClick={handleRemoveAvatar}
                  disabled={isSubmitting}
                >
                  Удалить
                </button>
              </div>
            ) : (
              <label className={styles.avatarLabel}>
                <input
                  type="file"
                  accept="image/*"
                  className={styles.avatarInput}
                  onChange={handleAvatarChange}
                  disabled={isSubmitting}
                />
                <span className={styles.avatarLabelText}>Выберите фото</span>
              </label>
            )}
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
      </div>
    </div>
  )
}

