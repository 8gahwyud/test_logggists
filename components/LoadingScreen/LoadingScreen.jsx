'use client'

import styles from './LoadingScreen.module.css'

export default function LoadingScreen() {
  return (
    <div className={styles.container}>
      <div className={styles.loader}>
        <div className={styles.spinnerWrapper}>
          <div className={styles.spinner}></div>
        </div>
        <p className={styles.text}>Загрузка...</p>
      </div>
    </div>
  )
}

