import styles from './FilterTabs.module.css'

export default function FilterTabs({ currentFilter, setCurrentFilter }) {
  return (
    <div className={styles.tabs}>
      <button 
        className={`${styles.tab} ${currentFilter === 'active' ? styles.active : ''}`}
        onClick={() => setCurrentFilter('active')}
        data-order-filter="active"
      >
        Активные
      </button>
      <button 
        className={`${styles.tab} ${currentFilter === 'finished' ? styles.active : ''}`}
        onClick={() => setCurrentFilter('finished')}
        data-order-filter="finished"
      >
        Завершенные
      </button>
    </div>
  )
}








