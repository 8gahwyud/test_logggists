'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import { pluralizeOrder } from '@/utils/pluralize'
import styles from './CreateOrderPage.module.css'

export default function CreateOrderPage() {
  const router = useRouter()
  const { userId, callApi, loadUserOrders, loadUserBalance, showAlert, profile, checkNegativeBalance } = useApp()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    metro_station: '',
    date: '',
    start_time: '',
    people: 1,
    duration: 1,
    rate: ''
  })
  const [photos, setPhotos] = useState([]) // Массив выбранных фото (File objects)
  const [photoPreviews, setPhotoPreviews] = useState([]) // Preview URL для отображения
  const [isLoading, setIsLoading] = useState(false) // Состояние загрузки
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const datePickerRef = useRef(null)
  const timePickerRef = useRef(null)
  const hoursScrollRef = useRef(null)
  const minutesScrollRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!userId) {
      await showAlert("Ошибка", "Не удалось определить пользователя. Попробуйте перезагрузить страницу.")
      return
    }

    // Проверяем минусовой баланс
    if (checkNegativeBalance && await checkNegativeBalance()) {
      return
    }

    // Проверяем лимит создания заказов
    const orderLimit = profile?.subscription?.order_limit || 5
    const dailyCollected = profile?.daily_collected_count || 0
    if (dailyCollected >= orderLimit) {
      await showAlert("Лимит достигнут", `Достигнут дневной лимит создания ${pluralizeOrder(orderLimit)} (${orderLimit}). Попробуйте завтра.`)
      return
    }

    const startTime = formData.date && formData.start_time 
      ? `${formData.date}T${formData.start_time}:00` 
      : null

    // Проверяем, что часы - целое число (кратность 1)
    if (!Number.isInteger(parseFloat(formData.duration)) || formData.duration < 1) {
      await showAlert("Ошибка", "Количество часов должно быть целым числом, минимум 1 час")
      return
    }

    if (parseFloat(formData.rate) < 200) {
      await showAlert("Ошибка", "Минимальная стоимость часа - 200₽")
      return
    }

    // Проверяем размер фото перед отправкой (максимум 10 МБ)
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 МБ
    const tooLargePhotos = photos.filter(photo => photo.size > MAX_FILE_SIZE)
    
    if (tooLargePhotos.length > 0) {
      const fileNames = tooLargePhotos.map(f => f.name).join(', ')
      const sizesMB = tooLargePhotos.map(f => (f.size / (1024 * 1024)).toFixed(2)).join(', ')
      await showAlert(
        "Ошибка", 
        `Следующие фото слишком большие (максимум 10 МБ):\n${fileNames}\nРазмеры: ${sizesMB} МБ\n\nПожалуйста, удалите эти фото и выберите файлы меньшего размера.`
      )
      // Данные формы остаются - пользователь может исправить и попробовать снова
      return
    }

    // Создаем FormData для отправки фото
    const formDataToSend = new FormData()
    formDataToSend.append('action', 'createOrder')
    formDataToSend.append('created_by', userId)
    formDataToSend.append('title', formData.title.trim())
    formDataToSend.append('description', formData.description.trim())
    formDataToSend.append('location', formData.location.trim())
    formDataToSend.append('metro_station', formData.metro_station.trim())
    formDataToSend.append('start_time', startTime || '')
    formDataToSend.append('required_slots', String(parseInt(formData.people) || 1))
    formDataToSend.append('duration_hours', String(formData.duration))
    formDataToSend.append('wage_per_hour', String(parseFloat(formData.rate) || 0))
    formDataToSend.append('deposit_amount', '0')
    formDataToSend.append('premium', 'false')
    formDataToSend.append('filters', JSON.stringify({}))
    
    // Добавляем фото
    console.log('[createOrder] Отправляем', photos.length, 'фото на сервер')
    photos.forEach((photo, index) => {
      console.log(`[createOrder] Фото ${index}:`, photo.name, 'размер:', photo.size, 'тип:', photo.type)
      formDataToSend.append(`photo_${index}`, photo)
    })
    formDataToSend.append('photos_count', String(photos.length))
    console.log('[createOrder] FormData подготовлен, photos_count:', photos.length)

    // Включаем лоадер
    setIsLoading(true)
    const loadingStartTime = Date.now()
    const MIN_LOADING_TIME = 1000 // Минимум 1 секунда (уменьшено с 2 секунд)

    try {
      // Отправляем FormData напрямую на API
      const API_URL = "https://zaaiwvnohyupxajurnrn.supabase.co/functions/v1/smart-api"
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphYWl3dm5vaHl1cHhhanVybnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MDgwNTUsImV4cCI6MjA3MzA4NDA1NX0.IaQjZ-oxkFzIhiTsACXOEZxL5kAzXh-CdmsDBZth8bI"
      
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
          "x-client-info": "shabashka-frontend"
          // НЕ устанавливаем Content-Type для FormData - браузер установит автоматически с boundary
        },
        body: formDataToSend
      }).then(r => r.json())
      
      // Ждем минимум 1 секунду
      const elapsedTime = Date.now() - loadingStartTime
      if (elapsedTime < MIN_LOADING_TIME) {
        await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME - elapsedTime))
      }
      
      if (resp?.success) {
        // Очищаем форму сразу
        setFormData({
          title: '',
          description: '',
          location: '',
          metro_station: '',
          date: '',
          start_time: '',
          people: 1,
          duration: 1,
          rate: ''
        })
        // Очищаем фото и освобождаем preview URLs
        photoPreviews.forEach(url => URL.revokeObjectURL(url))
        setPhotos([])
        setPhotoPreviews([])
        
        // Выключаем лоадер
        setIsLoading(false)
        
        // Обновляем данные в фоне и сразу переходим
        loadUserOrders().catch(console.error)
        loadUserBalance().catch(console.error)
        
        // Показываем уведомление без ожидания и сразу переходим
        showAlert("Успех", "Заказ успешно создан!").catch(console.error)
        
        // Переходим на страницу заказов сразу
        router.push('/orders')
      } else {
        setIsLoading(false)
        // При ошибке данные формы остаются - пользователь может исправить и попробовать снова
        const errorMessage = resp?.error?.message || resp?.error || "Неизвестная ошибка"
        await showAlert("Ошибка", "Ошибка создания заказа: " + errorMessage)
        // Данные формы НЕ очищаются - остаются для повторной попытки
      }
    } catch (err) {
      // Ждем минимум 1 секунду даже при ошибке
      const elapsedTime = Date.now() - loadingStartTime
      if (elapsedTime < MIN_LOADING_TIME) {
        await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME - elapsedTime))
      }
      setIsLoading(false)
      console.error("[createOrder] Ошибка:", err)
      // При ошибке данные формы остаются - пользователь может исправить и попробовать снова
      await showAlert("Ошибка", "Ошибка при создании заказа: " + (err.message || "Неизвестная ошибка"))
      // Данные формы НЕ очищаются - остаются для повторной попытки
    }
  }

  const handleChange = (e) => {
    let newValue = e.target.value
    const fieldName = e.target.name
    
    // Для поля duration - только целые числа
    if (fieldName === 'duration') {
      // Удаляем все нецифровые символы кроме пустой строки
      if (newValue === '' || newValue === '-') {
        // Разрешаем пустую строку или минус для ввода
        newValue = newValue
      } else {
        // Округляем до целого числа
        const numValue = Math.round(parseFloat(newValue) || 0)
        // Если значение меньше 1, устанавливаем 1
        newValue = numValue < 1 ? 1 : numValue
      }
    }
    
    const newFormData = {
      ...formData,
      [fieldName]: newValue
    }
    
    // Если изменилась дата и выбрана сегодняшняя дата, проверяем время
    if (fieldName === 'date') {
      const today = new Date().toISOString().split('T')[0]
      if (newValue === today && formData.start_time) {
        const now = new Date()
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        if (formData.start_time < currentTime) {
          // Если выбранное время раньше текущего, сбрасываем его
          newFormData.start_time = ''
        }
      }
    }
    
    setFormData(newFormData)
  }
  
  // Обработчик для блокировки ввода точки/запятой в поле duration
  const handleDurationKeyDown = (e) => {
    // Блокируем ввод точки, запятой и других недопустимых символов
    if (e.key === '.' || e.key === ',' || e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
      e.preventDefault()
    }
  }

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files)
    const remainingSlots = 5 - photos.length
    
    if (files.length > remainingSlots) {
      showAlert("Ошибка", `Можно загрузить максимум 5 фото. Осталось мест: ${remainingSlots}`)
      return
    }
    
    // Проверяем размер файлов (максимум 10 МБ)
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 МБ
    const tooLargeFiles = files.filter(file => file.size > MAX_FILE_SIZE)
    
    if (tooLargeFiles.length > 0) {
      const fileNames = tooLargeFiles.map(f => f.name).join(', ')
      const sizesMB = tooLargeFiles.map(f => (f.size / (1024 * 1024)).toFixed(2)).join(', ')
      showAlert(
        "Ошибка", 
        `Следующие файлы слишком большие (максимум 10 МБ):\n${fileNames}\nРазмеры: ${sizesMB} МБ\n\nПожалуйста, выберите файлы меньшего размера.`
      )
      // Очищаем input, чтобы пользователь мог выбрать другие файлы
      e.target.value = ''
      return
    }
    
    const newPhotos = [...photos, ...files.slice(0, remainingSlots)]
    setPhotos(newPhotos)
    
    // Создаем preview для новых фото
    const newPreviews = files.slice(0, remainingSlots).map(file => URL.createObjectURL(file))
    setPhotoPreviews([...photoPreviews, ...newPreviews])
  }

  const removePhoto = (index) => {
    // Освобождаем URL preview
    URL.revokeObjectURL(photoPreviews[index])
    
    const newPhotos = photos.filter((_, i) => i !== index)
    const newPreviews = photoPreviews.filter((_, i) => i !== index)
    
    setPhotos(newPhotos)
    setPhotoPreviews(newPreviews)
  }

  // Закрытие календаря при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Не закрываем, если клик был на самом инпуте (он открывает календарь)
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        const isDateInput = event.target.closest(`.${styles.dateTimeInput}`)
        if (!isDateInput) {
          setShowDatePicker(false)
        }
      }
      if (timePickerRef.current && !timePickerRef.current.contains(event.target)) {
        const isTimeInput = event.target.closest(`.${styles.dateTimeInput}`)
        if (!isTimeInput) {
          setShowTimePicker(false)
        }
      }
    }

    // Используем небольшой таймаут, чтобы не закрывать сразу при открытии
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker, showTimePicker])

  // Автопрокрутка к выбранному времени при открытии
  useEffect(() => {
    if (showTimePicker) {
      // Прокрутка к выбранному часу
      if (hoursScrollRef.current) {
        const selectedHour = formData.start_time ? parseInt(formData.start_time.split(':')[0]) : new Date().getHours()
        setTimeout(() => {
          const containerHeight = hoursScrollRef.current.clientHeight
          const itemHeight = 40
          const centerOffset = (containerHeight - itemHeight) / 2
          const targetScroll = selectedHour * itemHeight + 80 - centerOffset
          hoursScrollRef.current.scrollTo({
            top: targetScroll,
            behavior: 'auto'
          })
        }, 100)
      }
      
      // Прокрутка к выбранной минуте
      if (minutesScrollRef.current) {
        const selectedMinute = formData.start_time ? parseInt(formData.start_time.split(':')[1]) : 0
        const minuteIndex = [0, 10, 20, 30, 40, 50].indexOf(selectedMinute)
        const targetMinute = minuteIndex !== -1 ? selectedMinute : 0
        const finalIndex = [0, 10, 20, 30, 40, 50].indexOf(targetMinute)
        if (finalIndex !== -1) {
          setTimeout(() => {
            const containerHeight = minutesScrollRef.current.clientHeight
            const itemHeight = 40
            const centerOffset = (containerHeight - itemHeight) / 2
            const targetScroll = finalIndex * itemHeight + 80 - centerOffset
            minutesScrollRef.current.scrollTo({
              top: targetScroll,
              behavior: 'auto'
            })
          }, 150)
        }
      }
    }
  }, [showTimePicker])

  // Обработка скролла для snap к центру (без автоматического обновления времени)
  useEffect(() => {
    const handleScroll = (scrollElement, items, isHours) => {
      if (!scrollElement) return
      
      const containerHeight = scrollElement.clientHeight
      const itemHeight = 40
      const centerOffset = (containerHeight - itemHeight) / 2
      const scrollTop = scrollElement.scrollTop
      
      // Находим ближайший элемент к центру
      const index = Math.round((scrollTop + centerOffset - 80) / itemHeight)
      
      if (index >= 0 && index < items.length) {
        const targetScroll = index * itemHeight + 80 - centerOffset
        
        // Выравниваем только если скролл остановился
        const currentScroll = scrollElement.scrollTop
        if (Math.abs(currentScroll - targetScroll) > 2) {
          scrollElement.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          })
        }
      }
    }

    let scrollTimeout
    let isScrolling = false
    
    const hoursHandler = () => {
      isScrolling = true
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        isScrolling = false
        handleScroll(hoursScrollRef.current, Array.from({ length: 24 }, (_, i) => i), true)
      }, 200)
    }

    const minutesHandler = () => {
      isScrolling = true
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        isScrolling = false
        handleScroll(minutesScrollRef.current, [0, 10, 20, 30, 40, 50], false)
      }, 200)
    }

    if (showTimePicker) {
      if (hoursScrollRef.current) {
        hoursScrollRef.current.addEventListener('scroll', hoursHandler, { passive: true })
      }
      if (minutesScrollRef.current) {
        minutesScrollRef.current.addEventListener('scroll', minutesHandler, { passive: true })
      }
    }

    return () => {
      clearTimeout(scrollTimeout)
      if (hoursScrollRef.current) {
        hoursScrollRef.current.removeEventListener('scroll', hoursHandler)
      }
      if (minutesScrollRef.current) {
        minutesScrollRef.current.removeEventListener('scroll', minutesHandler)
      }
    }
  }, [showTimePicker])

  // Функции для работы с календарем
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay()
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString + 'T00:00:00')
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  }

  const handleDateSelect = (day, month, year) => {
    const selectedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setFormData({
      ...formData,
      date: selectedDate
    })
    setCalendarMonth({ year, month })
    setShowDatePicker(false)
  }

  const handleTimeSelect = (hours, minutes) => {
    const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    setFormData({
      ...formData,
      start_time: time
    })
    setShowTimePicker(false)
  }

  // Используем отдельное состояние для отображения месяца в календаре
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth() }
  })
  
  const navigateMonth = (direction) => {
    setCalendarMonth(prev => {
      const newDate = new Date(prev.year, prev.month + direction, 1)
      return { year: newDate.getFullYear(), month: newDate.getMonth() }
    })
  }

  // Генерация календаря
  const renderCalendar = () => {
    const today = new Date()
    const displayYear = calendarMonth.year
    const displayMonth = calendarMonth.month
    
    const daysInMonth = getDaysInMonth(displayYear, displayMonth)
    const firstDay = getFirstDayOfMonth(displayYear, displayMonth)
    const days = []
    
    // Дни предыдущего месяца
    const prevMonthDays = getDaysInMonth(displayYear, displayMonth - 1)
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        month: displayMonth - 1,
        year: displayMonth === 0 ? displayYear - 1 : displayYear,
        isCurrentMonth: false,
        isPast: true
      })
    }
    
    // Дни текущего месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(displayYear, displayMonth, day)
      const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
      days.push({
        day,
        month: displayMonth,
        year: displayYear,
        isCurrentMonth: true,
        isPast
      })
    }
    
    // Дни следующего месяца
    const remainingDays = 42 - days.length
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        month: displayMonth + 1,
        year: displayMonth === 11 ? displayYear + 1 : displayYear,
        isCurrentMonth: false,
        isPast: false
      })
    }
    
    return days
  }

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

  return (
    <main className={styles.main}>
      {isLoading && (
        <div className={styles.loaderOverlay}>
          <div className={styles.loaderContent}>
            <div className={styles.spinner}></div>
            <p className={styles.loaderText}>Загружаем ваш заказ</p>
          </div>
        </div>
      )}
      
      <h1 className={styles.title}>Создание заказа</h1>

      <form className={styles.form} onSubmit={handleSubmit} style={{ opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto' }}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="title">
            Название заказа
          </label>
          <input
            type="text"
            className={styles.input}
            id="title"
            name="title"
            placeholder="Введите название"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="description">
            Описание
          </label>
          <textarea
            className={styles.textarea}
            id="description"
            name="description"
            placeholder="Опишите детали заказа"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="photos">
            Фото (максимум 5, до 10 МБ каждое)
          </label>
          <div className={styles.photosContainer}>
            {photoPreviews.length > 0 && (
              <div className={styles.photosPreview}>
                {photoPreviews.map((preview, index) => {
                  const file = photos[index]
                  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(2) : '0'
                  const MAX_FILE_SIZE = 10 * 1024 * 1024
                  const isTooLarge = file && file.size > MAX_FILE_SIZE
                  
                  return (
                    <div key={index} className={styles.photoPreview}>
                      <img src={preview} alt={`Preview ${index + 1}`} />
                      <div className={styles.photoInfo}>
                        <span className={styles.photoName} title={file?.name || ''}>
                          {file?.name || `Фото ${index + 1}`}
                        </span>
                        <span className={`${styles.photoSize} ${isTooLarge ? styles.photoSizeError : ''}`}>
                          {fileSizeMB} МБ {isTooLarge && '(слишком большой!)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.removePhoto}
                        onClick={() => removePhoto(index)}
                        aria-label="Удалить фото"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {photos.length < 5 && (
              <label htmlFor="photos" className={styles.photoUpload}>
                <input
                  type="file"
                  id="photos"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
                <div className={styles.photoUploadButton}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Добавить фото</span>
                </div>
              </label>
            )}
          </div>
          {photos.length > 0 && (
            <p className={styles.photoCount}>
              Загружено: {photos.length} / 5
            </p>
          )}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="location">
            Адрес
          </label>
          <input
            type="text"
            className={styles.input}
            id="location"
            name="location"
            placeholder="Укажите адрес"
            value={formData.location}
            onChange={handleChange}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="metro_station">
            Станция метро
          </label>
          <input
            type="text"
            className={styles.input}
            id="metro_station"
            name="metro_station"
            placeholder="Укажите станцию метро"
            value={formData.metro_station}
            onChange={handleChange}
            required
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="date">
              Дата
            </label>
            <div className={styles.dateTimePickerWrapper} ref={datePickerRef}>
              <div 
                className={styles.dateTimeInput}
                onClick={() => {
                  setShowDatePicker(!showDatePicker)
                  setShowTimePicker(false)
                }}
              >
                {formData.date ? formatDate(formData.date) : 'Выберите дату'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2V6M16 2V6M3 10H21M5 4H19C20.1046 4 21 4.89543 21 6V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V6C3 4.89543 3.89543 4 5 4Z" stroke="#1775F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {showDatePicker && (
                <div className={styles.calendar}>
                  <div className={styles.calendarHeader}>
                    <button 
                      type="button"
                      className={styles.calendarNavButton}
                      onClick={() => navigateMonth(-1)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <div className={styles.calendarMonthYear}>
                      {`${monthNames[calendarMonth.month]} ${calendarMonth.year}`}
                    </div>
                    <button 
                      type="button"
                      className={styles.calendarNavButton}
                      onClick={() => navigateMonth(1)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  <div className={styles.calendarWeekdays}>
                    {dayNames.map(day => (
                      <div key={day} className={styles.calendarWeekday}>{day}</div>
                    ))}
                  </div>
                  <div className={styles.calendarDays}>
                    {renderCalendar().map((dateInfo, index) => {
                      const isSelected = formData.date && 
                        `${dateInfo.year}-${String(dateInfo.month + 1).padStart(2, '0')}-${String(dateInfo.day).padStart(2, '0')}` === formData.date
                      const isToday = dateInfo.isCurrentMonth && 
                        dateInfo.year === new Date().getFullYear() &&
                        dateInfo.month === new Date().getMonth() &&
                        dateInfo.day === new Date().getDate()
                      
                      return (
                        <button
                          key={index}
                          type="button"
                          className={`${styles.calendarDay} ${
                            !dateInfo.isCurrentMonth ? styles.calendarDayOtherMonth : ''
                          } ${
                            dateInfo.isPast ? styles.calendarDayPast : ''
                          } ${
                            isSelected ? styles.calendarDaySelected : ''
                          } ${
                            isToday ? styles.calendarDayToday : ''
                          }`}
                          onClick={() => {
                            if (!dateInfo.isPast) {
                              handleDateSelect(dateInfo.day, dateInfo.month, dateInfo.year)
                            }
                          }}
                          disabled={dateInfo.isPast}
                        >
                          {dateInfo.day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="start_time">
              Время
            </label>
            <div className={styles.dateTimePickerWrapper} ref={timePickerRef}>
              <div 
                className={styles.dateTimeInput}
                onClick={() => {
                  setShowTimePicker(!showTimePicker)
                  setShowDatePicker(false)
                }}
              >
                {formData.start_time || 'Выберите время'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#1775F1" strokeWidth="2"/>
                  <path d="M12 6V12L16 14" stroke="#1775F1" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              {showTimePicker && (
                <div className={styles.timePicker}>
                  <div className={styles.timePickerColumn}>
                    <div className={styles.timePickerLabel}>Часы</div>
                    <div className={styles.timePickerScrollWrapper}>
                      <div className={styles.timePickerOverlay}></div>
                      <div className={styles.timePickerScroll} ref={hoursScrollRef}>
                        {Array.from({ length: 24 }, (_, i) => {
                        const isToday = formData.date === new Date().toISOString().split('T')[0]
                        const currentHour = new Date().getHours()
                        const isPast = isToday && i < currentHour
                        const isSelected = formData.start_time && parseInt(formData.start_time.split(':')[0]) === i
                        
                        return (
                          <div
                            key={i}
                            className={`${styles.timePickerItem} ${
                              isPast ? styles.timePickerItemPast : ''
                            } ${
                              isSelected ? styles.timePickerItemSelected : ''
                            }`}
                            onClick={() => {
                              if (!isPast) {
                                const minutes = formData.start_time ? parseInt(formData.start_time.split(':')[1]) : 0
                                handleTimeSelect(i, minutes)
                              }
                            }}
                          >
                            {String(i).padStart(2, '0')}
                          </div>
                        )
                      })}
                      </div>
                    </div>
                  </div>
                  <div className={styles.timePickerColumn}>
                    <div className={styles.timePickerLabel}>Минуты</div>
                    <div className={styles.timePickerScrollWrapper}>
                      <div className={styles.timePickerOverlay}></div>
                      <div className={styles.timePickerScroll} ref={minutesScrollRef}>
                        {[0, 10, 20, 30, 40, 50].map(minute => {
                        const isToday = formData.date === new Date().toISOString().split('T')[0]
                        const currentHour = new Date().getHours()
                        const currentMinute = new Date().getMinutes()
                        const selectedHour = formData.start_time ? parseInt(formData.start_time.split(':')[0]) : null
                        const isPast = isToday && selectedHour === currentHour && minute < currentMinute
                        const isSelected = formData.start_time && parseInt(formData.start_time.split(':')[1]) === minute
                        
                        return (
                          <div
                            key={minute}
                            className={`${styles.timePickerItem} ${
                              isPast ? styles.timePickerItemPast : ''
                            } ${
                              isSelected ? styles.timePickerItemSelected : ''
                            }`}
                            onClick={() => {
                              if (!isPast) {
                                const hours = formData.start_time ? parseInt(formData.start_time.split(':')[0]) : 0
                                handleTimeSelect(hours, minute)
                              }
                            }}
                          >
                            {String(minute).padStart(2, '0')}
                          </div>
                        )
                      })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="people">
              Количество людей
            </label>
            <input
              type="number"
              className={styles.input}
              id="people"
              name="people"
              min="1"
              value={formData.people}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="duration">
              Часы
            </label>
            <input
              type="number"
              className={styles.input}
              id="duration"
              name="duration"
              min="1"
              step="1"
              value={formData.duration}
              onChange={handleChange}
              onKeyDown={handleDurationKeyDown}
              onBlur={(e) => {
                // При потере фокуса округляем до целого, если введено дробное
                const value = Math.round(parseFloat(e.target.value) || 1)
                if (value < 1) {
                  setFormData({ ...formData, duration: 1 })
                } else if (value !== parseFloat(e.target.value)) {
                  setFormData({ ...formData, duration: value })
                }
              }}
              required
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="rate">
            Стоимость часа (₽)
          </label>
          <input
            type="number"
            className={styles.input}
            id="rate"
            name="rate"
            min="200"
            step="1"
            placeholder="200"
            value={formData.rate}
            onChange={handleChange}
            required
          />
        </div>

        {formData.rate && formData.duration && formData.people && (
          <div className={styles.calculation}>
            <div className={styles.calculationRow}>
              <span>На человека:</span>
              <span className={styles.calculationValue}>
                {Number(formData.rate) * Number(formData.duration)} ₽
              </span>
            </div>
            <div className={styles.calculationRow}>
              <span>Итого:</span>
              <span className={styles.calculationTotal}>
                {Number(formData.rate) * Number(formData.duration) * Number(formData.people)} ₽
              </span>
            </div>
          </div>
        )}

        <button type="submit" className={styles.submitBtn} disabled={isLoading}>
          {isLoading ? 'Создание...' : 'Создать заказ'}
        </button>
      </form>
    </main>
  )
}


