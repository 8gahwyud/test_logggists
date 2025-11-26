'use client'

import { useState, useEffect } from 'react'
import styles from './FiltersModal.module.css'

export default function FiltersModal({ isOpen, onClose, onApply, orders = [] }) {
  const [selectedMetro, setSelectedMetro] = useState([])
  const [minRating, setMinRating] = useState('')
  const [premiumOnly, setPremiumOnly] = useState(false)

  // Автогенерация списка станций метро из заказов
  const metroStations = Array.from(
    new Set(
      orders
        .map(order => order.metro_station)
        .filter(Boolean)
    )
  ).sort()

  // Автогенерация диапазона рейтингов
  const ratingOptions = [
    { value: '', label: 'Любой' },
    { value: '90', label: '90+ (Отличный)' },
    { value: '80', label: '80+ (Хороший)' },
    { value: '70', label: '70+ (Надежный)' },
    { value: '60', label: '60+ (Средний)' },
    { value: '50', label: '50+ (Начинающий)' }
  ]

  const handleMetroToggle = (metro) => {
    setSelectedMetro(prev => 
      prev.includes(metro)
        ? prev.filter(m => m !== metro)
        : [...prev, metro]
    )
  }

  const handleReset = () => {
    setSelectedMetro([])
    setMinRating('')
    setPremiumOnly(false)
  }

  const handleApply = () => {
    onApply({
      metro: selectedMetro,
      minRating: minRating ? Number(minRating) : null,
      premiumOnly
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <button className={styles.close} onClick={onClose}>&times;</button>
          <h2 className={styles.title}>Фильтры</h2>
        </div>

        <div className={styles.body}>
          {/* Станции метро */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Станция метро</h3>
            <div className={styles.metroGrid}>
              {metroStations.length > 0 ? (
                metroStations.map(metro => (
                  <button
                    key={metro}
                    className={`${styles.metroChip} ${selectedMetro.includes(metro) ? styles.active : ''}`}
                    onClick={() => handleMetroToggle(metro)}
                  >
                    {metro}
                  </button>
                ))
              ) : (
                <p className={styles.empty}>Нет доступных станций</p>
              )}
            </div>
          </div>

          {/* Рейтинг */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Минимальный рейтинг</h3>
            <select
              className={styles.select}
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
            >
              {ratingOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Премиум */}
          <div className={styles.section}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={premiumOnly}
                onChange={(e) => setPremiumOnly(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Только премиум заказы</span>
            </label>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.resetBtn} onClick={handleReset}>
            Сбросить
          </button>
          <button className={styles.applyBtn} onClick={handleApply}>
            Применить
          </button>
        </div>
      </div>
    </div>
  )
}







