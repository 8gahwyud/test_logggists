'use client'

import { useApp } from '@/lib/AppContext'
import { formatTimeAgo } from '@/lib/utils'
import { pluralizeResponse, pluralizePerson, pluralizeHour } from '@/utils/pluralize'
import PhotoCarousel from './PhotoCarousel'

const escapeHtml = (str = "") => {
  if (!str) return ""
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
import styles from './OrderCard.module.css'

export default function OrderCard({ order, onClick }) {
  const { profile } = useApp()
  
  const requiredSlots = order.required_slots || order.people_needed || 1
  const responsesCount = order.responses_count || order.responses?.length || 0
  
  // Парсим фото из JSON строки или массива
  let orderPhotos = []
  
  // Парсим фото из JSON строки или массива
  if (order.photos) {
    try {
      orderPhotos = typeof order.photos === 'string' 
        ? JSON.parse(order.photos) 
        : order.photos
      if (!Array.isArray(orderPhotos)) {
        orderPhotos = []
      }
    } catch (e) {
      console.error('[OrderCard] Ошибка парсинга photos:', e, 'order.photos:', order.photos)
      orderPhotos = []
    }
  }
  
  const hasPhotos = orderPhotos.length > 0
  
  // Логируем для отладки
  if (hasPhotos) {
    console.log('[OrderCard] Заказ', order.id, 'имеет', orderPhotos.length, 'фото:', orderPhotos)
  }
  
  // Определяем, находится ли заказ в работе
  const isInWork = order.status === 'working' || order.status === 'in_progress' || order.status === 'accepted'
  
  // Определяем рамочку для заказа
  const tierInfo = {
    logist_start: { frame: 'grey' },
    logist_light: { frame: 'blue' },
    logist_business: { frame: 'gold' }
  }[profile.subscription_tier] || { frame: 'grey' }
  
  let frameClass = styles.frameGrey
  if (isInWork) {
    frameClass = styles.frameGreen
  } else if (order.premium) {
    frameClass = styles.frameGold
  } else if (tierInfo.frame === 'gold') {
    frameClass = styles.frameGold
  } else if (tierInfo.frame === 'blue') {
    frameClass = styles.frameBlue
  }


  return (
    <div 
      className={`${styles.card} ${frameClass} ${hasPhotos ? styles.cardWithPhotos : ''}`} 
      onClick={order.status !== 'completed' ? onClick : undefined}
      onMouseDown={(e) => {
        // Предотвращаем выделение при клике
        if (e.target === e.currentTarget || e.target.closest(`.${styles.card}`)) {
          e.preventDefault()
        }
      }}
      style={{ 
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none'
      }}
    >
      {hasPhotos ? (
        <div 
          className={styles.photoSection}
          onClick={(e) => {
            // Блокируем всплытие клика на секцию фото
            e.stopPropagation()
          }}
        >
          <PhotoCarousel photos={orderPhotos} orderId={order.id} />
        </div>
      ) : null}
      <div className={hasPhotos ? styles.content : undefined}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{escapeHtml(order.title || 'Без названия')}</span>
          {order.premium && (
            <span className={styles.premiumBadge}>PREMIUM</span>
          )}
        </div>
        <p className={styles.description}>{escapeHtml(order.description || '')}</p>
        
        <div className={styles.locationInfo}>
          {order.location && (
            <div className={styles.locationItem}>
              <div className={styles.icon}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 21C15.5 17.4 19 14.1764 19 10.2C19 6.22355 15.7764 3 12 3C8.22355 3 5 6.22355 5 10.2C5 14.1764 8.5 17.4 12 21Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className={styles.locationText}>{escapeHtml(order.location)}</span>
            </div>
          )}
          {order.metro_station && (
            <div className={styles.locationItem}>
              <div className={styles.icon}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 10C17 13.866 12 20 12 20C12 20 7 13.866 7 10C7 6.13401 9.68629 3 12 3C14.3137 3 17 6.13401 17 10Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10C10 11.1046 10.8954 12 12 12Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 20H19" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 20V16" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 20V16" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className={styles.locationText}>{escapeHtml(order.metro_station)}</span>
            </div>
          )}
        </div>
        
        <div className={styles.info}>
          <div className={styles.timePeople}>
            <div className={styles.infoItem}>
              <div className={styles.icon}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className={styles.text}>{order.duration_hours || 0} {pluralizeHour(order.duration_hours || 0)}</span>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.icon}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.3503 17.623 3.8507 18.1676 4.55231C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className={styles.text}>{requiredSlots} {pluralizePerson(requiredSlots)}</span>
            </div>
          </div>
        </div>
        
        <div className={styles.container}>
          <div className={styles.containerCustomer}>
            <span className={styles.customer}>
              {order.status === 'completed' ? 'Завершен' : `${responsesCount} ${pluralizeResponse(responsesCount)}`}
            </span>
            <span className={styles.time}>{formatTimeAgo(order.created_at)}</span>
          </div>
          <div className={styles.containerOrder}>
            <span className={styles.price}>{order.wage_per_hour || 0}₽ в час</span>
            {order.status !== 'completed' && (
              <button 
                className={styles.button}
                onClick={(e) => {
                  e.stopPropagation()
                  onClick()
                }}
              >
                Открыть панель
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


