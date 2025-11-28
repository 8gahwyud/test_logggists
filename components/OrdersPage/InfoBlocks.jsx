import styles from './InfoBlocks.module.css'
import { pluralizeOrder } from '@/utils/pluralize'

export default function InfoBlocks({ stats }) {
  return (
    <div className={styles.blocks}>
      <div className={styles.block}>
        <p className={styles.maininfo}>{stats.activeOrders}</p>
        <p className={styles.dopinfo}>Активных {pluralizeOrder(stats.activeOrders || 0)}</p>
      </div>
      <div className={styles.block}>
        <p className={styles.maininfo}>{stats.inWork}</p>
        <p className={styles.dopinfo}>В работе</p>
      </div>
      <div className={styles.block}>
        <p className={styles.maininfo}>{stats.availableOrders}</p>
        <p className={styles.dopinfo}>Доступно {pluralizeOrder(stats.availableOrders || 0)}</p>
      </div>
    </div>
  )
}




