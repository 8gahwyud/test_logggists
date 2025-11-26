'use client'

import { useState } from 'react'
import styles from './SearchBar.module.css'

export default function SearchBar({ onSearch, onFilterClick, hasActiveFilters = false }) {
  const [searchValue, setSearchValue] = useState('')

  const handleChange = (e) => {
    const value = e.target.value
    setSearchValue(value)
    if (onSearch) {
      onSearch(value)
    }
  }

  return (
    <div className={styles.searchBlock}>
      <input 
        className={styles.searchInput} 
        type="text" 
        placeholder="Поиск" 
        value={searchValue}
        onChange={handleChange}
      />
      <button 
        className={`${styles.filterBtn} ${hasActiveFilters ? styles.active : ''}`}
        onClick={onFilterClick}
        aria-label="Фильтры"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6H20M7 12H17M9 18H15" stroke="#666" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {hasActiveFilters && <span className={styles.badge}></span>}
      </button>
    </div>
  )
}


