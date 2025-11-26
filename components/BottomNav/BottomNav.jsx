'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './BottomNav.module.css'

export default function BottomNav({ onFinanceClick, onSupportClick }) {
  const pathname = usePathname()
  const getStrokeColor = (isActive) => isActive ? "#1775F1" : "#666"
  
  const isOrdersActive = pathname === '/orders'
  const isCreateActive = pathname === '/create'
  const isProfileActive = pathname === '/profile'

  return (
    <nav className={styles.nav}>
      <Link 
        href="/orders"
        className={`${styles.icon} ${isOrdersActive ? styles.active : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8 7V3M16 7V3M7 11H17M5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21Z"
            stroke={getStrokeColor(isOrdersActive)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.label}>Заказы</span>
      </Link>
      <button 
        className={styles.icon}
        onClick={onFinanceClick}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 1V23M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6"
            stroke="#666"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.label}>Финансы</span>
      </button>
      <Link 
        href="/create"
        className={`${styles.icon} ${isCreateActive ? styles.active : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M12 5V19M5 12H19" 
            stroke={getStrokeColor(isCreateActive)} 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <circle 
            cx="12" 
            cy="12" 
            r="10" 
            stroke={getStrokeColor(isCreateActive)} 
            strokeWidth="2" 
          />
        </svg>
        <span className={styles.label}>Создать</span>
      </Link>
      <Link 
        href="/profile"
        className={`${styles.icon} ${isProfileActive ? styles.active : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21"
            stroke={getStrokeColor(isProfileActive)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z"
            stroke={getStrokeColor(isProfileActive)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.label}>Профиль</span>
      </Link>
      <button 
        className={styles.icon}
        onClick={onSupportClick}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M18.364 5.63604C21.8787 9.15076 21.8787 14.8492 18.364 18.364C14.8492 21.8787 9.15076 21.8787 5.63604 18.364C2.12132 14.8492 2.12132 9.15076 5.63604 5.63604C9.15076 2.12132 14.8492 2.12132 18.364 5.63604"
            stroke="#666"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path 
            d="M12 16V12M12 8H12.01" 
            stroke="#666" 
            strokeWidth="2" 
            strokeLinecap="round"
            strokeLinejoin="round" 
          />
        </svg>
        <span className={styles.label}>Поддержка</span>
      </button>
    </nav>
  )
}

