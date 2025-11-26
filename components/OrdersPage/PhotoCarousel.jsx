'use client'

import { useState } from 'react'
import styles from './PhotoCarousel.module.css'

export default function PhotoCarousel({ photos, orderId }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)

  // Минимальная дистанция для свайпа
  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      // Циклическая навигация: если в конце, переходим в начало
      setCurrentIndex((prev) => (prev + 1) % photos.length)
    }
    if (isRightSwipe) {
      // Циклическая навигация: если в начале, переходим в конец
      setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length)
    }
  }

  if (!photos || photos.length === 0) {
    console.log('[PhotoCarousel] Нет фото для отображения, photos:', photos)
    return null
  }

  const showArrows = photos.length > 1
  console.log('[PhotoCarousel] Рендерим карусель:', {
    orderId,
    photosCount: photos.length,
    photos: photos,
    showArrows,
    currentIndex
  })

  return (
    <div 
      className={styles.carousel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={(e) => {
        // Блокируем всплытие клика на карусель, чтобы не открывалась карточка
        e.stopPropagation()
      }}
      style={{ display: 'block', visibility: 'visible', position: 'relative' }}
    >
      <div 
        className={styles.carouselTrack}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {photos.map((photo, index) => (
          <div key={index} className={styles.carouselSlide}>
            <img 
              src={photo} 
              alt={`Фото заказа ${index + 1}`}
              className={styles.carouselImage}
              loading="lazy"
              onError={(e) => {
                console.error('[PhotoCarousel] Ошибка загрузки фото', index, ':', photo)
              }}
            />
          </div>
        ))}
      </div>
      
      {showArrows && (
        <div className={styles.carouselIndicators}>
          {photos.map((_, index) => (
            <button
              key={index}
              className={`${styles.indicator} ${index === currentIndex ? styles.active : ''}`}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setCurrentIndex(index)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
              }}
              aria-label={`Перейти к фото ${index + 1}`}
            />
          ))}
        </div>
      )}
      
      {/* Стрелки - всегда показываем если фото больше одного */}
      {showArrows && (
        <>
          <button
            className={`${styles.carouselButton} ${styles.carouselButtonLeft}`}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              // Циклическая навигация: если в начале, переходим в конец
              setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
            }}
            aria-label="Предыдущее фото"
            style={{ 
              display: 'flex !important',
              visibility: 'visible !important',
              opacity: '1 !important'
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          <button
            className={`${styles.carouselButton} ${styles.carouselButtonRight}`}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              // Циклическая навигация: если в конце, переходим в начало
              setCurrentIndex((prev) => (prev + 1) % photos.length)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
            }}
            aria-label="Следующее фото"
            style={{ 
              display: 'flex !important',
              visibility: 'visible !important',
              opacity: '1 !important'
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

