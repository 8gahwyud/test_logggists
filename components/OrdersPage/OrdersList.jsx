import OrderCard from './OrderCard'
import styles from './OrdersList.module.css'

export default function OrdersList({ orders, filter, onOrderClick }) {
  // Фильтрация уже выполнена в OrdersPage, просто отображаем переданные заказы
  const filteredOrders = orders || []

  if (!orders || orders.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Заказов не найдено.</p>
      </div>
    )
  }

  if (filteredOrders.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{filter === 'finished' ? 'Завершенных заказов нет.' : 'Активных заказов нет.'}</p>
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

