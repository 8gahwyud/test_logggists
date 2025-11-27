'use client'

import { useEffect, useRef } from 'react'

/**
 * Хук для закрытия модалки свайпом вниз
 * @param {Function} onClose - функция закрытия модалки
 * @param {boolean} isOpen - открыта ли модалка
 * @param {number} threshold - минимальное расстояние свайпа для закрытия (по умолчанию 100px)
 */
export function useSwipeToClose(onClose, isOpen, threshold = 100) {
  const contentRef = useRef(null)
  const startYRef = useRef(null)
  const currentYRef = useRef(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    if (!isOpen || !contentRef.current) return

    const content = contentRef.current
    let startY = null
    let currentY = null
    let isDragging = false

    const handleTouchStart = (e) => {
      // Проверяем, что свайп начинается от верхней части модалки (первые 100px)
      const touch = e.touches[0]
      const rect = content.getBoundingClientRect()
      const touchY = touch.clientY - rect.top

      if (touchY < 100) {
        startY = touch.clientY
        currentY = touch.clientY
        isDragging = true
        content.style.transition = 'none'
      }
    }

    const handleTouchMove = (e) => {
      if (!isDragging || startY === null) return

      currentY = e.touches[0].clientY
      const deltaY = currentY - startY

      // Разрешаем свайп только вниз
      if (deltaY > 0) {
        content.style.transform = `translateY(${deltaY}px)`
        // Добавляем прозрачность при свайпе
        const opacity = Math.max(0.3, 1 - deltaY / 300)
        content.style.opacity = opacity
      }
    }

    const handleTouchEnd = (e) => {
      if (!isDragging || startY === null) return

      const deltaY = currentY - startY

      content.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out'

      if (deltaY > threshold) {
        // Закрываем модалку
        content.style.transform = 'translateY(100%)'
        content.style.opacity = '0'
        setTimeout(() => {
          if (onClose) onClose()
          // Сбрасываем стили
          content.style.transform = ''
          content.style.opacity = ''
          content.style.transition = ''
        }, 300)
      } else {
        // Возвращаем на место
        content.style.transform = ''
        content.style.opacity = ''
      }

      startY = null
      currentY = null
      isDragging = false
    }

    content.addEventListener('touchstart', handleTouchStart, { passive: true })
    content.addEventListener('touchmove', handleTouchMove, { passive: true })
    content.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      content.removeEventListener('touchstart', handleTouchStart)
      content.removeEventListener('touchmove', handleTouchMove)
      content.removeEventListener('touchend', handleTouchEnd)
      // Сбрасываем стили при размонтировании
      if (content) {
        content.style.transform = ''
        content.style.opacity = ''
        content.style.transition = ''
      }
    }
  }, [isOpen, onClose, threshold])

  return contentRef
}

