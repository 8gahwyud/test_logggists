'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './EditOrderModal.module.css'
import { useSwipeToClose } from '@/hooks/useSwipeToClose'

export default function EditOrderModal({ order, onClose, onUpdate }) {
  const { callApi, showAlert, loadUserOrders, checkNegativeBalance } = useApp()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    required_slots: order?.required_slots || 1,
    wage_per_hour: order?.wage_per_hour || ''
  })
  const [originalWage, setOriginalWage] = useState(order?.wage_per_hour || 0)
  const [inputValues, setInputValues] = useState({
    required_slots: String(order?.required_slots || 1),
    wage_per_hour: String(order?.wage_per_hour || '')
  })

  useEffect(() => {
    if (order) {
      setFormData({
        required_slots: order.required_slots || 1,
        wage_per_hour: order.wage_per_hour || ''
      })
      setOriginalWage(order.wage_per_hour || 0)
      setInputValues({
        required_slots: String(order.required_slots || 1),
        wage_per_hour: String(order.wage_per_hour || '')
      })
    }
  }, [order])

  const contentRef = useSwipeToClose(onClose, true)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = ''
      }
    }
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    
    // Обновляем строковое значение для отображения (разрешаем пустые значения)
    setInputValues(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Парсим и обновляем числовое значение только если есть валидное число
    if (name === 'required_slots') {
      // Для количества людей - разрешаем любое значение >= 1, можно уменьшать
      if (value === '' || value === '-') {
        // Разрешаем пустое значение во время ввода
        return
      }
      const numValue = parseInt(value)
      if (!isNaN(numValue) && numValue >= 1) {
        setFormData(prev => ({
          ...prev,
          [name]: numValue
        }))
      }
    } else if (name === 'wage_per_hour') {
      // Для стоимости - можно только увеличивать
      if (value === '' || value === '-') {
        // Разрешаем пустое значение во время ввода
        return
      }
      const numValue = parseFloat(value)
      if (!isNaN(numValue)) {
        // Проверяем, что новая стоимость не меньше оригинальной
        if (numValue >= originalWage) {
          setFormData(prev => ({
            ...prev,
            [name]: numValue
          }))
        } else {
          // Если меньше оригинальной, не обновляем formData, но оставляем в input для показа ошибки
          // Пользователь увидит, что значение не применилось
        }
      }
    }
  }
  
  const handleBlur = (e) => {
    const { name, value } = e.target
    
    if (name === 'required_slots') {
      // При потере фокуса - если пусто или невалидно, возвращаем к последнему валидному значению
      if (value === '' || isNaN(parseInt(value)) || parseInt(value) < 1) {
        const validValue = formData.required_slots || 1
        setInputValues(prev => ({
          ...prev,
          [name]: String(validValue)
        }))
        setFormData(prev => ({
          ...prev,
          [name]: validValue
        }))
      }
    } else if (name === 'wage_per_hour') {
      // При потере фокуса - если пусто или меньше оригинальной, возвращаем к последнему валидному значению
      const numValue = parseFloat(value)
      if (value === '' || isNaN(numValue) || numValue < originalWage) {
        const validValue = formData.wage_per_hour || originalWage
        setInputValues(prev => ({
          ...prev,
          [name]: String(validValue)
        }))
        setFormData(prev => ({
          ...prev,
          [name]: validValue
        }))
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (isLoading) return

    // Проверяем минусовой баланс
    if (checkNegativeBalance && await checkNegativeBalance()) {
      return
    }

    // Валидация
    if (formData.required_slots < 1) {
      await showAlert("Ошибка", "Количество людей должно быть не менее 1")
      return
    }

    if (formData.wage_per_hour < originalWage) {
      await showAlert("Ошибка", `Стоимость не может быть меньше ${originalWage}₽`)
      return
    }

    setIsLoading(true)

    try {
      const resp = await callApi({
        action: "updateOrder",
        order_id: order.id,
        required_slots: formData.required_slots,
        wage_per_hour: formData.wage_per_hour,
        update_created_at: true // Обновляем created_at, чтобы заказ поднялся вверх
      })

      if (resp?.success) {
        await showAlert("Успех", "Заказ успешно обновлен!")
        if (loadUserOrders) {
          await loadUserOrders()
        }
        if (onUpdate) {
          onUpdate()
        }
        onClose()
      } else {
        await showAlert("Ошибка", "Ошибка при обновлении заказа: " + (resp?.error || "Неизвестная ошибка"))
      }
    } catch (error) {
      console.error("[EditOrderModal] Ошибка:", error)
      await showAlert("Ошибка", "Ошибка при обновлении заказа: " + (error.message || "Неизвестная ошибка"))
    } finally {
      setIsLoading(false)
    }
  }

  if (!order) return null

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div ref={contentRef} className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <button className={styles.close} onClick={onClose}>&times;</button>
          <h2 className={styles.title}>Редактирование заказа</h2>
          <p className={styles.subtitle}>Измените параметры заказа</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              Количество людей
            </label>
            <input
              type="number"
              name="required_slots"
              className={styles.input}
              value={inputValues.required_slots}
              onChange={handleChange}
              onBlur={handleBlur}
              min="1"
              step="1"
              required
            />
            <p className={styles.hint}>Минимум: 1 человек</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Стоимость за час (₽)
            </label>
            <input
              type="number"
              name="wage_per_hour"
              className={styles.input}
              value={inputValues.wage_per_hour}
              onChange={handleChange}
              onBlur={handleBlur}
              min={originalWage}
              step="1"
              required
            />
            <p className={styles.hint}>
              Минимум: {originalWage}₽ (можно только увеличить)
            </p>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isLoading}
            >
              Отмена
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading}
            >
              {isLoading ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

