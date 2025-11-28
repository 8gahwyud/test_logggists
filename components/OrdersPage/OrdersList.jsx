import OrderCard from './OrderCard'
import styles from './OrdersList.module.css'
import { pluralizeOrder } from '@/utils/pluralize'

export default function OrdersList({ orders, filter, onOrderClick }) {
  // Фильтрация уже выполнена в OrdersPage, просто отображаем переданные заказы
  const filteredOrders = orders || []

  if (!orders || orders.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{pluralizeOrder(0)} не найдено.</p>
      </div>
    )
  }

  if (filteredOrders.length === 0) {
    const count = 0
    const orderWord = pluralizeOrder(count)
    return (
      <div className={styles.empty}>
        <p>{filter === 'finished' ? `Завершенных ${orderWord} нет.` : `Активных ${orderWord} нет.`}</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {filteredOrders.map(order => (
        <OrderCard 
          key={order.id} 
          order={order} 
          onClick={() => onOrderClick(order)}
        />
      ))}
    </div>
  )
}

