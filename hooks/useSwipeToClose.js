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
    let initialTransform = 0 // Начальное положение transform
    let hadBottomSheetActive = false // Был ли класс bottomSheetActive изначально
    // Кэшируем overlay при первом поиске
    let overlayCache = null

    const getOverlay = () => {
      if (overlayCache) return overlayCache
      const modal = content.closest('.modal') || content.parentElement
      overlayCache = modal?.querySelector?.('.overlay') || 
                     (modal?.classList?.contains('bottomSheetOverlay') ? modal : modal?.querySelector?.('.bottomSheetOverlay'))
      return overlayCache
    }

    const handleTouchStart = (e) => {
      // Проверяем, что клик не был на кнопке закрытия или другом интерактивном элементе
      const target = e.target
      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('select') || target.closest('textarea')) {
        return // Не начинаем свайп, если клик был на интерактивном элементе
      }
      
      // Проверяем, что свайп начинается от верхней части модалки (первые 100px)
      const touch = e.touches[0]
      if (!touch) return
      
      const rect = content.getBoundingClientRect()
      const touchY = touch.clientY - rect.top

      if (touchY < 100) {
        // Сохраняем начальное положение transform
        // Для модалки подписок с классом bottomSheetActive начальное положение 0
        hadBottomSheetActive = content.classList.contains('bottomSheetActive')
        if (hadBottomSheetActive) {
          initialTransform = 0
        } else {
          const computedStyle = window.getComputedStyle(content)
          const matrix = new DOMMatrix(computedStyle.transform)
          initialTransform = matrix.m42 // translateY значение
        }
        
        startY = touch.clientY
        currentY = touch.clientY
        isDragging = true
        
        // Отключаем все transitions
        content.style.transition = 'none'
        content.style.willChange = 'transform'
        // Удаляем класс, который может конфликтовать с transform
        if (hadBottomSheetActive) {
          content.classList.remove('bottomSheetActive')
        }
        
        // Отключаем transition для overlay при начале свайпа
        const overlay = getOverlay()
        if (overlay) {
          overlay.style.transition = 'none'
        }
        // Предотвращаем прокрутку при свайпе
        e.preventDefault()
      }
    }

    const handleTouchMove = (e) => {
      if (!isDragging || startY === null) return

      const touch = e.touches[0]
      if (!touch) return

      currentY = touch.clientY
      const deltaY = currentY - startY

      // Разрешаем движение в любом направлении (вверх и вниз)
      // Предотвращаем прокрутку при активном свайпе
      e.preventDefault()
      
      // Убеждаемся, что transition отключен
      content.style.transition = 'none'
      
      // Вычисляем новое положение с учетом начального transform
      // Разрешаем движение вверх (отрицательный deltaY) и вниз (положительный deltaY)
      const newTransform = initialTransform + deltaY
      // Ограничиваем движение вверх - модалка не должна подниматься выше начальной позиции
      // Для модалок с bottomSheetActive начальная позиция 0, для других - их текущая позиция
      const minTransform = initialTransform // Не поднимаем выше начальной позиции
      const clampedTransform = Math.max(minTransform, newTransform)
      content.style.transform = `translateY(${clampedTransform}px)`
      
      // Изменение прозрачности только при движении вниз
      if (deltaY > 0) {
        const opacity = Math.max(0.2, 1 - deltaY / 400)
        content.style.opacity = opacity
        
        // Анимируем overlay при свайпе вниз
        const overlay = getOverlay()
        if (overlay) {
          const overlayOpacity = Math.max(0, 0.5 - deltaY / 400)
          overlay.style.opacity = overlayOpacity.toString()
        }
      } else {
        // При движении вверх возвращаем полную прозрачность
        content.style.opacity = '1'
        const overlay = getOverlay()
        if (overlay) {
          overlay.style.opacity = ''
        }
      }
    }

    const handleTouchEnd = (e) => {
      if (!isDragging || startY === null) return

      const deltaY = currentY - startY
      const overlay = getOverlay()

      // Используем более плавную функцию easing для закрытия
      content.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1)'

      if (deltaY > threshold) {
        // Закрываем модалку только если отпустили внизу
        // Вычисляем высоту контента для правильного закрытия
        const contentHeight = content.offsetHeight || content.getBoundingClientRect().height
        const finalTransform = Math.max(contentHeight, window.innerHeight)
        
        content.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
        content.style.transform = `translateY(${finalTransform}px)`
        content.style.opacity = '0'
        
        // Анимируем overlay, если он есть
        if (overlay) {
          overlay.style.transition = 'opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
          overlay.style.opacity = '0'
        }
        
        // Вызываем onClose после завершения анимации
        setTimeout(() => {
          if (onClose) {
            onClose()
          }
        }, 400)
        
        // Сбрасываем стили только после того, как модалка закроется
        // Не сбрасываем сразу, чтобы избежать мигания
      } else {
        // Возвращаем на место с плавной анимацией
        content.style.willChange = ''
        content.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
        // Возвращаем к начальному положению и восстанавливаем класс
        // Для модалки подписок (hadBottomSheetActive === true) возвращаем к 0 и восстанавливаем класс
        if (hadBottomSheetActive) {
          content.style.transform = 'translateY(0)'
          // Восстанавливаем класс после завершения анимации
          setTimeout(() => {
            if (content && !content.classList.contains('bottomSheetActive')) {
              content.classList.add('bottomSheetActive')
              content.style.transform = ''
            }
          }, 300)
        } else {
          content.style.transform = `translateY(${initialTransform}px)`
        }
        content.style.opacity = ''
        
        // Возвращаем overlay на место
        if (overlay) {
          overlay.style.transition = 'opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
          overlay.style.opacity = ''
        }
      }

      startY = null
      currentY = null
      isDragging = false
      initialTransform = 0
      hadBottomSheetActive = false
    }

    content.addEventListener('touchstart', handleTouchStart, { passive: false })
    content.addEventListener('touchmove', handleTouchMove, { passive: false })
    content.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      if (content) {
        content.removeEventListener('touchstart', handleTouchStart)
        content.removeEventListener('touchmove', handleTouchMove)
        content.removeEventListener('touchend', handleTouchEnd)
        // Сбрасываем стили при размонтировании
        content.style.transform = ''
        content.style.opacity = ''
        content.style.transition = ''
        // Сбрасываем стили overlay
        const overlay = getOverlay()
        if (overlay) {
          overlay.style.opacity = ''
          overlay.style.transition = ''
        }
        overlayCache = null
      }
    }
  }, [isOpen, onClose, threshold])

  return contentRef
}


