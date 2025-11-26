// supabase/functions/user-orders/index.ts
// Deno + Supabase Edge Function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, accept-profile, range",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const PERFORMER_TIERS = {
  free_performer: {
    name: "Start (free)",
    daily_apply_limit: 15,
    active_jobs_limit: 5,
    commission_pct: 20,
    priority_rank: 0,
    quick_apply: false,
    frame: "grey",
    plaque: "новый"
  },
  silver: {
    name: "Silver",
    daily_apply_limit: 25,
    active_jobs_limit: 10,
    commission_pct: 10,
    priority_rank: 1,
    quick_apply: true,
    frame: "blue",
    plaque: "проверенный"
  },
  gold: {
    name: "Gold",
    daily_apply_limit: 35,
    active_jobs_limit: 15,
    commission_pct: 10,
    priority_rank: 2,
    quick_apply: true,
    frame: "gold",
    plaque: "надежный"
  }
};
const LOGIST_TIERS = {
  logist_start: {
    name: "Logist Start",
    daily_collected_limit: 5,
    frame: "grey",
    priority_index: 0,
    filters_allowed: [],
    plaque: "новый"
  },
  logist_light: {
    name: "Logist Light",
    daily_collected_limit: 15,
    frame: "blue",
    priority_index: 1,
    filters_allowed: [
      "rating_min"
    ],
    plaque: "активный логист"
  },
  logist_business: {
    name: "Logist Business",
    daily_collected_limit: 30,
    frame: "gold",
    priority_index: 2,
    filters_allowed: [
      "rating_min",
      "gender",
      "experience",
      "premium_only"
    ],
    plaque: "надежный партнер"
  }
};
// ========== СИСТЕМА РЕЙТИНГА ==========
// Функция получения названия рейтинга по значению (0-100)
function getRatingName(rating) {
  if (rating >= 90) return "Отличный";
  if (rating >= 80) return "Хороший";
  if (rating >= 70) return "Надежный";
  if (rating >= 60) return "Средний";
  if (rating >= 50) return "Начинающий";
  return "Низкий";
}
// Функция получения цвета рейтинга по значению
function getRatingColor(rating) {
  if (rating >= 90) return "#10B981"; // green
  if (rating >= 80) return "#3B82F6"; // blue
  if (rating >= 70) return "#F59E0B"; // yellow
  if (rating >= 60) return "#F97316"; // orange
  if (rating >= 50) return "#6B7280"; // gray
  return "#EF4444"; // red
}
// Функция расчета среднего значения характеристик и добавления в рейтинг
function calculateRatingFromCharacteristics(result, punctuality, communication) {
  const average = (result + punctuality + communication) / 3;
  // Округляем до целого числа и добавляем к рейтингу
  return Math.round(average);
}
// Функция обновления рейтинга пользователя
async function updateUserRating(supabase, telegramId, delta, reason) {
  try {
    // Получаем текущий рейтинг пользователя
    const { data: user, error: userErr } = await supabase.from("users").select("rating").eq("telegram_id", telegramId).single();
    if (userErr || !user) {
      console.error(`[updateUserRating] Ошибка получения пользователя ${telegramId}:`, userErr);
      return {
        error: userErr,
        newRating: null
      };
    }
    const currentRating = Number(user.rating || 50); // По умолчанию 50
    const newRating = Math.max(0, Math.min(100, currentRating + delta)); // Ограничиваем 0-100
    // Обновляем рейтинг
    const { error: updateErr } = await supabase.from("users").update({
      rating: newRating.toString()
    }).eq("telegram_id", telegramId);
    if (updateErr) {
      console.error(`[updateUserRating] Ошибка обновления рейтинга для ${telegramId}:`, updateErr);
      return {
        error: updateErr,
        newRating: null
      };
    }
    console.log(`[updateUserRating] ✅ Рейтинг пользователя ${telegramId} обновлен: ${currentRating} → ${newRating} (${delta > 0 ? '+' : ''}${delta}) - ${reason}`);
    return {
      error: null,
      newRating
    };
  } catch (e) {
    console.error(`[updateUserRating] Ошибка:`, e);
    return {
      error: e,
      newRating: null
    };
  }
}
// Функция сохранения оценки характеристик
// ИЗМЕНЕНИЕ: Сохраняем оценку в таблицу ratings
async function saveRatingCharacteristics(supabase, orderId, performerTelegramId, logistTelegramId, result, punctuality, communication) {
  try {
    console.log(`[saveRatingCharacteristics] Сохранение оценки исполнителя ${performerTelegramId} логистом ${logistTelegramId} за заказ ${orderId}`);
    // Сохраняем оценку в таблицу ratings
    const { data: ratingData, error: ratingErr } = await supabase.from("ratings").insert({
      order_id: orderId,
      rater_id: logistTelegramId,
      rater_role: "logist",
      rated_id: performerTelegramId,
      rated_role: "performer",
      result: result,
      punctuality: punctuality,
      communication: communication,
      created_at: toISO(new Date())
    }).select().single();
    if (ratingErr) {
      console.error(`[saveRatingCharacteristics] Ошибка сохранения оценки в ratings:`, ratingErr);
      // Если таблицы ratings нет, пробуем сохранить в transactions для совместимости
      const { error: transactionErr } = await supabase.from("transactions").insert({
        user_id: performerTelegramId,
        order_id: orderId,
        type: "rating",
        amount: 0,
        description: JSON.stringify({
          result,
          punctuality,
          communication,
          logist_id: logistTelegramId
        }),
        created_at: toISO(new Date())
      });
      if (transactionErr) {
        console.error(`[saveRatingCharacteristics] Ошибка сохранения оценки в transactions:`, transactionErr);
        return {
          error: transactionErr
        };
      }
    } else {
      console.log(`[saveRatingCharacteristics] ✅ Оценка сохранена в ratings:`, ratingData);
    }
    // Рассчитываем бонус рейтинга на основе характеристик
    const ratingBonus = calculateRatingFromCharacteristics(result, punctuality, communication);
    // Обновляем рейтинг исполнителя на основе характеристик
    await updateUserRating(supabase, performerTelegramId, ratingBonus, `Оценка характеристик за заказ #${orderId}: результат=${result}, пунктуальность=${punctuality}, коммуникация=${communication}`);
    return {
      error: null
    };
  } catch (e) {
    console.error(`[saveRatingCharacteristics] Ошибка:`, e);
    return {
      error: e
    };
  }
}
// ИЗМЕНЕНИЕ: Новая функция для сохранения оценки логиста исполнителем
async function saveLogistRatingCharacteristics(supabase, orderId, logistTelegramId, performerTelegramId, result, punctuality, communication) {
  try {
    console.log(`[saveLogistRatingCharacteristics] Сохранение оценки логиста ${logistTelegramId} исполнителем ${performerTelegramId} за заказ ${orderId}`);
    // Сохраняем оценку в таблицу ratings
    const { data: ratingData, error: ratingErr } = await supabase.from("ratings").insert({
      order_id: orderId,
      rater_id: performerTelegramId,
      rater_role: "performer",
      rated_id: logistTelegramId,
      rated_role: "logist",
      result: result,
      punctuality: punctuality,
      communication: communication,
      created_at: toISO(new Date())
    }).select().single();
    if (ratingErr) {
      console.error(`[saveLogistRatingCharacteristics] Ошибка сохранения оценки в ratings:`, ratingErr);
      return {
        error: ratingErr
      };
    }
    console.log(`[saveLogistRatingCharacteristics] ✅ Оценка сохранена в ratings:`, ratingData);
    // Рассчитываем бонус рейтинга на основе характеристик
    const ratingBonus = calculateRatingFromCharacteristics(result, punctuality, communication);
    // Обновляем рейтинг логиста на основе характеристик
    await updateUserRating(supabase, logistTelegramId, ratingBonus, `Оценка характеристик за заказ #${orderId}: результат=${result}, пунктуальность=${punctuality}, коммуникация=${communication}`);
    return {
      error: null
    };
  } catch (e) {
    console.error(`[saveLogistRatingCharacteristics] Ошибка:`, e);
    return {
      error: e
    };
  }
}
// ИЗМЕНЕНИЕ: Функция получения средних характеристик пользователя (исполнителя или логиста)
async function getAverageCharacteristics(supabase, userTelegramId, userRole = "performer") {
  try {
    console.log(`[getAverageCharacteristics] Получение характеристик для пользователя ${userTelegramId}, роль: ${userRole}`);
    // ИЗМЕНЕНИЕ: Получаем оценки из таблицы ratings
    const { data: ratings, error: ratingsErr } = await supabase.from("ratings").select("result, punctuality, communication").eq("rated_id", userTelegramId).eq("rated_role", userRole === "performer" ? "performer" : "logist");
    if (ratingsErr) {
      console.error(`[getAverageCharacteristics] Ошибка получения оценок из ratings:`, ratingsErr);
      // Пробуем получить из transactions для совместимости (старые данные)
      const { data: oldRatings, error: oldRatingsErr } = await supabase.from("transactions").select("description").eq("user_id", userTelegramId).eq("type", "rating");
      if (oldRatingsErr || !oldRatings || oldRatings.length === 0) {
        return {
          result: 0,
          punctuality: 0,
          communication: 0,
          count: 0
        };
      }
      // Обрабатываем старые данные из transactions
      let totalResult = 0;
      let totalPunctuality = 0;
      let totalCommunication = 0;
      let count = 0;
      for (const rating of oldRatings){
        try {
          const desc = typeof rating.description === 'string' ? JSON.parse(rating.description) : rating.description;
          if (desc.result && desc.punctuality && desc.communication) {
            totalResult += Number(desc.result);
            totalPunctuality += Number(desc.punctuality);
            totalCommunication += Number(desc.communication);
            count++;
          }
        } catch (e) {
          console.error(`[getAverageCharacteristics] Ошибка парсинга оценки:`, e);
        }
      }
      if (count === 0) {
        return {
          result: 0,
          punctuality: 0,
          communication: 0,
          count: 0
        };
      }
      return {
        result: Math.round(totalResult / count * 10) / 10,
        punctuality: Math.round(totalPunctuality / count * 10) / 10,
        communication: Math.round(totalCommunication / count * 10) / 10,
        count
      };
    }
    if (!ratings || ratings.length === 0) {
      console.log(`[getAverageCharacteristics] Оценок не найдено для пользователя ${userTelegramId}`);
      return {
        result: 0,
        punctuality: 0,
        communication: 0,
        count: 0
      };
    }
    let totalResult = 0;
    let totalPunctuality = 0;
    let totalCommunication = 0;
    let count = 0;
    for (const rating of ratings){
      if (rating.result && rating.punctuality && rating.communication) {
        totalResult += Number(rating.result);
        totalPunctuality += Number(rating.punctuality);
        totalCommunication += Number(rating.communication);
        count++;
      }
    }
    if (count === 0) {
      return {
        result: 0,
        punctuality: 0,
        communication: 0,
        count: 0
      };
    }
    const avgResult = Math.round(totalResult / count * 10) / 10;
    const avgPunctuality = Math.round(totalPunctuality / count * 10) / 10;
    const avgCommunication = Math.round(totalCommunication / count * 10) / 10;
    console.log(`[getAverageCharacteristics] Средние характеристики для ${userTelegramId}:`, {
      result: avgResult,
      punctuality: avgPunctuality,
      communication: avgCommunication,
      count
    });
    return {
      result: avgResult,
      punctuality: avgPunctuality,
      communication: avgCommunication,
      count
    };
  } catch (e) {
    console.error(`[getAverageCharacteristics] Ошибка:`, e);
    return {
      result: 0,
      punctuality: 0,
      communication: 0,
      count: 0
    };
  }
}
// Штрафы при отмене заказа логистом (в процентах от стоимости заказа)
const CANCELLATION_RULES = [
  {
    minHoursBefore: 12,
    maxHoursBefore: Infinity,
    penaltyPct: 20,
    platformPct: 10,
    redistributePct: 10
  },
  {
    minHoursBefore: 3,
    maxHoursBefore: 12,
    penaltyPct: 20,
    platformPct: 10,
    redistributePct: 10
  },
  {
    minHoursBefore: 0,
    maxHoursBefore: 3,
    penaltyPct: 30,
    platformPct: 10,
    redistributePct: 20
  }
];
// --- Утилиты ---
const now = ()=>new Date();
const toISO = (d)=>d.toISOString();

// Функция для расчёта штрафа за отмену заказа
function calculateCancellationPenalty(order, hoursUntilStart) {
  const wagePerHour = Number(order.wage_per_hour || 0);
  const durationHours = Number(order.duration_hours || 0);
  const requiredSlots = Number(order.required_slots || 1);
  const collectedAmount = Number(order.collected_amount || 0);
  
  // Общая стоимость заказа
  const totalOrderAmount = collectedAmount > 0 ? collectedAmount : (wagePerHour * durationHours * requiredSlots);
  
  // Проверяем, набрался ли заказ (есть ли подтвержденные исполнители)
  const hasConfirmedPerformers = order.executor_ids && order.executor_ids.trim() !== '';
  
  if (!hasConfirmedPerformers) {
    // Заказ не набрался - без штрафа
    return {
      penaltyPercent: 0,
      penaltyAmount: 0,
      platformFee: 0,
      performerCompensation: 0,
      totalOrderAmount,
      reason: "Заказ не набрался"
    };
  }
  
  let penaltyPercent = 0;
  let reason = "";
  
  if (hoursUntilStart < 3) {
    // Меньше 3 часов - 30% (10% нам, 20% исполнителям)
    penaltyPercent = 30;
    reason = "Отмена менее чем за 3 часа до начала";
  } else if (hoursUntilStart < 12) {
    // Меньше 12 часов - 20% (10% нам, 10% исполнителям)
    penaltyPercent = 20;
    reason = "Отмена менее чем за 12 часов до начала";
  } else {
    // Больше 12 часов - 10% от всего заказа
    penaltyPercent = 10;
    reason = "Отмена заказа после набора исполнителей";
  }
  
  const penaltyAmount = Math.round(totalOrderAmount * penaltyPercent / 100 * 100) / 100;
  
  // Распределение штрафа
  let platformFee = 0;
  let performerCompensation = 0;
  
  if (hoursUntilStart < 3) {
    // 10% платформе, 20% исполнителям
    platformFee = Math.round(totalOrderAmount * 10 / 100 * 100) / 100;
    performerCompensation = Math.round(totalOrderAmount * 20 / 100 * 100) / 100;
  } else if (hoursUntilStart < 12) {
    // 10% платформе, 10% исполнителям
    platformFee = Math.round(totalOrderAmount * 10 / 100 * 100) / 100;
    performerCompensation = Math.round(totalOrderAmount * 10 / 100 * 100) / 100;
  } else {
    // 10% платформе
    platformFee = penaltyAmount;
    performerCompensation = 0;
  }
  
  return {
    penaltyPercent,
    penaltyAmount,
    platformFee,
    performerCompensation,
    totalOrderAmount,
    reason
  };
}

// ========== СИСТЕМА УВЕДОМЛЕНИЙ ==========
// Вспомогательная функция для создания уведомлений
// Параметры:
//   supabase - клиент Supabase
//   userId - telegram_id пользователя, которому отправляется уведомление
//   type - тип уведомления: 'response_accepted', 'order_confirmed', 'new_message', 'order_cancelled', 'new_response'
//   payload - объект с дополнительными данными (order_id, response_id, sender_id и т.д.)
//   message - текст уведомления (опционально, будет сгенерирован автоматически если не указан)
async function createNotification(supabase, userId, type, payload = {}, message = null) {
  try {
    // Генерируем сообщение, если не указано
    if (!message) {
      switch (type) {
        case 'response_accepted':
          message = 'Ваш отклик принят! Подтвердите участие в заказе.';
          break;
        case 'order_confirmed':
          const responderName = (payload as any).responder_name || `Исполнитель ${(payload as any).responder_id || ''}`;
          const orderTitle = (payload as any).order_title || `Заказ #${(payload as any).order_id || ''}`;
          message = `${responderName} подтвердил участие в заказе "${orderTitle}"`;
          break;
        case 'new_message':
          const senderName = (payload as any).sender_name || `Пользователь ${(payload as any).sender_id || ''}`;
          const chatOrderTitle = (payload as any).order_title || `Заказ #${(payload as any).order_id || ''}`;
          message = `${senderName} написал в чате заказа "${chatOrderTitle}"`;
          break;
        case 'order_cancelled':
          const cancelledOrderTitle = (payload as any).order_title || `Заказ #${(payload as any).order_id || ''}`;
          message = `Заказ "${cancelledOrderTitle}" отменен`;
          break;
        case 'new_response':
          const logistName = (payload as any).logist_name || `Логист ${(payload as any).logist_id || ''}`;
          const responseOrderTitle = (payload as any).order_title || `Заказ #${(payload as any).order_id || ''}`;
          message = `Новый отклик на заказ "${responseOrderTitle}"`;
          break;
        default:
          message = 'У вас новое уведомление';
      }
    }

    const notificationData = {
      user_id: Number(userId),
      payload: JSON.stringify({
        type,
        ...payload
      }),
      message: message as string,
      read: false,
      is_read: false,
      created_at: toISO(new Date())
    };

    const { error } = await supabase.from("notifications").insert(notificationData);
    
    if (error) {
      console.error(`[createNotification] Ошибка создания уведомления для пользователя ${userId}, тип: ${type}:`, error);
      return { success: false, error };
    }
    
    console.log(`[createNotification] ✅ Уведомление создано для пользователя ${userId}, тип: ${type}`);
    return { success: true };
  } catch (e) {
    console.error(`[createNotification] Исключение при создании уведомления:`, e);
    return { success: false, error: e };
  }
}
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({
    error: message
  }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function successResponse(payload = {}, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function getPerformerTier(tierKey) {
  return tierKey && PERFORMER_TIERS[tierKey] ? PERFORMER_TIERS[tierKey] : PERFORMER_TIERS.free_performer;
}
function getLogistTier(tierKey) {
  return tierKey && LOGIST_TIERS[tierKey] ? LOGIST_TIERS[tierKey] : LOGIST_TIERS.logist_start;
}
// --- Основной обработчик ---
serve(async (req)=>{
  // Обрабатываем OPTIONS запросы ПЕРВЫМИ, до любых других операций
  if (req.method === "OPTIONS") {
    console.log("[CORS] Handling OPTIONS request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing SUPABASE env vars");
    return errorResponse("Server misconfiguration (missing SUPABASE env vars)", 500);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  try {
    // Проверяем Content-Type для определения формата данных
    const contentType = req.headers.get("content-type") || "";
    let body;
    let isFormData = false;
    
    if (contentType.includes("multipart/form-data")) {
      // Обрабатываем FormData
      isFormData = true;
      const formData = await req.formData();
      body = {};
      body.photos = [];
      
      console.log("[FormData] Начало обработки FormData");
      
      // КРИТИЧНО: FormData.entries() можно итерировать только ОДИН раз!
      // Собираем все данные за один проход
      console.log(`[FormData] ========== ОБРАБОТКА FORMDATA ==========`);
      
      const allEntries = [];
      const photosArray = [];
      let photosCount = 0;
      
      // ОДИН проход по FormData - собираем все данные
      for (const [key, value] of formData.entries()) {
        const isFile = value instanceof File;
        allEntries.push({ key, value, isFile });
        
        if (key === 'photos_count') {
          photosCount = parseInt(value as string || '0', 10);
          console.log(`[FormData] Ожидаемое количество фото: ${photosCount}`);
        } else if (key.startsWith('photo_')) {
          // Извлекаем индекс из ключа (photo_0, photo_1, etc.)
          const photoIndex = parseInt(key.replace('photo_', ''), 10);
          if (!isNaN(photoIndex) && isFile) {
            // Расширяем массив если нужно
            while (photosArray.length <= photoIndex) {
              photosArray.push(null);
            }
            photosArray[photoIndex] = value;
            console.log(`[FormData] ✅ Фото ${photoIndex} извлечено: размер=${value.size}, тип=${value.type}, имя=${value.name || 'unknown'}`);
          } else {
            console.error(`[FormData] ❌ Проблема с фото: ключ="${key}", isFile=${isFile}, индекс=${photoIndex}`);
          }
        } else if (key === 'avatar' && isFile) {
          // Обрабатываем аватарку
          body.avatar = value;
          console.log(`[FormData] ✅ Аватарка извлечена: размер=${value.size}, тип=${value.type}, имя=${value.name || 'unknown'}`);
        } else {
          // Обычные поля
          body[key] = value;
        }
      }
      
      console.log(`[FormData] Всего записей в FormData:`, allEntries.length);
      console.log(`[FormData] Все ключи:`, allEntries.map(e => e.key));
      allEntries.forEach((entry, idx) => {
        const photoIndex = entry.key.startsWith('photo_') ? parseInt(entry.key.replace('photo_', ''), 10) : null;
        console.log(`[FormData] Запись ${idx}: ключ="${entry.key}", isFile=${entry.isFile}, размер=${entry.isFile ? entry.value.size : 'N/A'}, фото_индекс=${photoIndex !== null ? photoIndex : 'N/A'}`);
      });
      
      // Добавляем все найденные фото в массив body.photos в правильном порядке
      for (let i = 0; i < photosArray.length; i++) {
        if (photosArray[i]) {
          body.photos.push(photosArray[i]);
          console.log(`[FormData] ✅ Фото ${i} добавлено в body.photos, размер: ${photosArray[i].size}`);
        } else if (i < photosCount) {
          console.error(`[FormData] ❌ Фото ${i} отсутствует в массиве (ожидалось ${photosCount} фото)!`);
        }
      }
      
      console.log(`[FormData] ========== ИТОГО: найдено фото: ${body.photos.length}, ожидалось: ${photosCount} ==========`);
      
      if (body.photos.length !== photosCount) {
        console.error(`[FormData] ❌ КРИТИЧЕСКАЯ ОШИБКА: количество фото не совпадает!`);
        console.error(`[FormData] photosArray состояние:`, photosArray.map((p, i) => ({ index: i, exists: !!p, size: p instanceof File ? p.size : null })));
        console.error(`[FormData] Все записи с photo_:`, allEntries.filter(e => e.key.startsWith('photo_')));
      }
      
      // Парсим JSON поля если нужно
      if (body.filters && typeof body.filters === 'string') {
        try {
          body.filters = JSON.parse(body.filters);
        } catch (e) {
          body.filters = {};
        }
      }
      
      // Преобразуем строковые числа в числа
      if (body.required_slots) body.required_slots = Number(body.required_slots) || 1;
      if (body.duration_hours) body.duration_hours = Number(body.duration_hours) || 4;
      if (body.wage_per_hour) body.wage_per_hour = Number(body.wage_per_hour) || 0;
      if (body.deposit_amount) body.deposit_amount = Number(body.deposit_amount) || 0;
      if (body.premium) body.premium = body.premium === 'true' || body.premium === true;
    } else {
      // Обрабатываем JSON
      try {
        body = await req.json();
      } catch (e) {
        return errorResponse("Invalid request body", 400);
      }
    }
    
    const { action } = body;
    console.log("[user-orders] action:", action, "isFormData:", isFormData);
    switch(action){
      // ========== 1) Получить доступные заказы (с фильтрацией, премиум, метро и приоритетом) ==========
      case "getAvailableOrders":
        {
          const { user_id, metro_station, premium_only, filters, page = 1, per_page = 50 } = body;
          console.log("[getAvailableOrders] Запрос:", {
            user_id,
            metro_station,
            premium_only,
            filters,
            page,
            per_page
          });
          // Получаем все активные заказы (status = 'new' или 'in_progress')
          // Сначала получаем заказы, потом отдельно получаем информацию о логистах
          let query = supabase.from("orders").select("*");
          // Применяем фильтр по статусу
          const statusFilter = [
            "new",
            "in_progress"
          ];
          query = query.in("status", statusFilter);
          console.log("[getAvailableOrders] Фильтр по статусу:", statusFilter);
          // ВРЕМЕННО ДЛЯ ОТЛАДКИ: Получаем заказы БЕЗ пагинации, чтобы увидеть все
          console.log("[getAvailableOrders] ВНИМАНИЕ: Используем пагинацию:", {
            page,
            per_page,
            range: `${(page - 1) * per_page}-${page * per_page - 1}`
          });
          // фильтр по метро
          if (metro_station) {
            query = query.eq("metro_station", metro_station);
          }
          if (premium_only) {
            query = query.eq("premium", true);
          }
          // Тут можно применить дополнительные фильтры из body.filters (gender, rating_min и т.д.)
          // Фильтр по рейтингу логиста будет применен после получения данных
          // Сначала получаем БЕЗ пагинации для отладки
          const { data: allOrders, error: allOrdersError } = await query.order("created_at", {
            ascending: false
          });
          console.log("[getAvailableOrders] Все заказы БЕЗ пагинации:", allOrders?.length || 0, allOrdersError ? `Ошибка: ${allOrdersError.message}` : "OK");
          if (allOrdersError) {
            console.error("[getAvailableOrders] Ошибка получения всех заказов:", allOrdersError);
          }
          // Теперь применяем пагинацию
          const { data: orders, error } = await query.order("created_at", {
            ascending: false
          }).range((page - 1) * per_page, page * per_page - 1);
          console.log("[getAvailableOrders] Заказы из БД:", orders?.length || 0, error ? `Ошибка: ${error.message}` : "OK");
          if (error) {
            console.error("[getAvailableOrders] Ошибка запроса:", error);
            console.error("[getAvailableOrders] Детали ошибки:", JSON.stringify(error, null, 2));
            throw new Error(error.message);
          }
          if (orders && orders.length > 0) {
            console.log("[getAvailableOrders] Первый заказ:", {
              id: orders[0].id,
              status: orders[0].status,
              premium: orders[0].premium,
              created_by: orders[0].created_by,
              title: orders[0].title
            });
            console.log("[getAvailableOrders] Все статусы заказов:", orders.map((o)=>o.status));
          } else {
            console.warn("[getAvailableOrders] Заказы не найдены! Проверьте фильтры статуса.");
          }
          // Если заказов нет, возвращаем пустой массив
          // Определяем какие заказы использовать
          let ordersToProcess = orders || [];
          // Если заказов нет после пагинации, но есть без пагинации - используем все
          if (!ordersToProcess || ordersToProcess.length === 0) {
            console.log("[getAvailableOrders] Нет заказов после пагинации");
            if (allOrders && allOrders.length > 0) {
              console.warn("[getAvailableOrders] НО есть заказы БЕЗ пагинации! Проблема с пагинацией или фильтрами");
              console.warn("[getAvailableOrders] Используем все заказы для отладки:", allOrders.length);
              ordersToProcess = allOrders;
            } else {
              console.log("[getAvailableOrders] Нет заказов в БД с указанными фильтрами (статус: new или in_progress)");
              return successResponse({
                success: true,
                orders: []
              });
            }
          }
          console.log("[getAvailableOrders] Обрабатываем заказов:", ordersToProcess.length);
          
          // Скрываем заказы, на которые пользователь уже откликался
          let userResponseOrderIds = [];
          if (user_id) {
            // Преобразуем в число, так как telegram_id в БД имеет тип bigint
            const telegramId = Number(user_id);
            const { data: userResponses, error: responsesError } = await supabase.from("order_responses").select("order_id").eq("user_id", telegramId);
            console.log("[getAvailableOrders] Отклики пользователя:", userResponses?.length || 0, responsesError ? `Ошибка: ${responsesError.message}` : "OK");
            if (!responsesError && userResponses) {
              userResponseOrderIds = userResponses.map((r)=>r.order_id);
              console.log("[getAvailableOrders] ID заказов с откликами:", userResponseOrderIds);
            }
          }
          const filtered = (ordersToProcess || []).filter((o)=>!userResponseOrderIds.includes(o.id));
          console.log("[getAvailableOrders] После фильтрации откликов:", filtered.length, "из", ordersToProcess?.length || 0);
          // Если у пользователя есть подписка, учитываем приоритет (исполнителю показываются сначала premium/по приоритету)
          // Получим полную информацию о пользователе по telegram_id
          let userTierRank = 0;
          let userProfile = null;
          console.log("[getAvailableOrders] ========== ЗАГРУЗКА ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ ==========");
          console.log("[getAvailableOrders] user_id из запроса:", user_id, "тип:", typeof user_id);
          
          if (user_id) {
            // Преобразуем в число, так как telegram_id в БД имеет тип bigint
            const telegramId = Number(user_id);
            console.log("[getAvailableOrders] Ищем пользователя с telegram_id:", telegramId, "тип:", typeof telegramId);
            
            // ИСПОЛЬЗУЕМ select("*") КАК В getUserBalance для загрузки всех полей
            const { data: user, error: userErr } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
            
            console.log("[getAvailableOrders] Результат поиска пользователя:", {
              found: !!user,
              error: userErr?.message,
              error_code: userErr?.code,
              user_telegram_id: user?.telegram_id,
              user_username: user?.username
            });
            
            if (!userErr && user) {
              console.log("[getAvailableOrders] ✅ Пользователь найден, загружаем профиль");
              const tier = getPerformerTier(user.subscription_tier);
              userTierRank = tier.priority_rank ?? 0;
              
              // Загружаем информацию о подписке
              let subscriptionInfo = null;
              let subscriptionTier = null;
              
              // ПРИОРИТЕТ 1: Проверяем subscription_tier из БД (если есть)
              const dbSubscriptionTier = user.subscription_tier;
              if (dbSubscriptionTier !== null && dbSubscriptionTier !== undefined && String(dbSubscriptionTier).trim() !== '') {
                subscriptionTier = String(dbSubscriptionTier).trim();
                console.log("[getAvailableOrders] ✅ Используем subscription_tier из БД:", subscriptionTier);
              }
              
              // ПРИОРИТЕТ 2: Если subscription_tier не определен, загружаем из подписки
              if (!subscriptionTier && user.subscription_id) {
                console.log("[getAvailableOrders] Загружаем подписку по subscription_id:", user.subscription_id);
                const { data: subscriptionData, error: subError } = await supabase
                  .from("subscriptions")
                  .select("id, name, price, role, order_limit")
                  .eq("id", user.subscription_id)
                  .single();
                
                console.log("[getAvailableOrders] Результат загрузки подписки:", {
                  found: !!subscriptionData,
                  error: subError?.message,
                  subscription_name: subscriptionData?.name,
                  subscription_role: subscriptionData?.role,
                  subscription_price: subscriptionData?.price
                });
                
                if (!subError && subscriptionData) {
                  subscriptionInfo = {
                    id: subscriptionData.id,
                    name: subscriptionData.name,
                    price: subscriptionData.price,
                    role: subscriptionData.role || "executor",
                    order_limit: subscriptionData.order_limit || 5
                  };
                  
                  console.log("[getAvailableOrders] Определяем subscription_tier из подписки:", {
                    role: subscriptionData.role,
                    name: subscriptionData.name,
                    price: subscriptionData.price
                  });
                  
                  // Определяем subscription_tier из подписки (по имени и цене, так как tier_key нет в БД)
                  if (subscriptionData.role === "executor") {
                    const subscriptionName = (subscriptionData.name || "").toLowerCase();
                    console.log("[getAvailableOrders] Маппинг по имени подписки:", subscriptionName);
                    if (subscriptionName.includes("basic") || subscriptionName.includes("free") || subscriptionName.includes("start")) {
                      subscriptionTier = "free_performer";
                      console.log("[getAvailableOrders] ✅ Определено как free_performer (по имени: basic/free/start)");
                    } else if (subscriptionName.includes("silver")) {
                      subscriptionTier = "silver";
                      console.log("[getAvailableOrders] ✅ Определено как silver (по имени)");
                    } else if (subscriptionName.includes("gold")) {
                      subscriptionTier = "gold";
                      console.log("[getAvailableOrders] ✅ Определено как gold (по имени)");
                    } else if (subscriptionData.price === 0 || subscriptionData.price === null || subscriptionData.price === "0") {
                      subscriptionTier = "free_performer";
                      console.log("[getAvailableOrders] ✅ Определено как free_performer (цена = 0)");
                    } else {
                      subscriptionTier = "silver";
                      console.log("[getAvailableOrders] ✅ Определено как silver (по умолчанию для платных)");
                    }
                  } else {
                    console.warn("[getAvailableOrders] ⚠️ Роль подписки не executor:", subscriptionData.role);
                  }
                  
                  console.log("[getAvailableOrders] subscriptionTier после определения из подписки:", subscriptionTier);
                } else {
                  console.error("[getAvailableOrders] ❌ Ошибка загрузки подписки:", subError);
                }
              } else {
                console.log("[getAvailableOrders] Пропускаем загрузку подписки:", {
                  subscriptionTier_already_set: !!subscriptionTier,
                  has_subscription_id: !!user.subscription_id
                });
              }
              
              // ПРИОРИТЕТ 3: Если все еще не определен, используем дефолтный
              if (!subscriptionTier) {
                subscriptionTier = "free_performer";
                console.log("[getAvailableOrders] ⚠️ subscription_tier не определен, используем дефолтный: free_performer");
              }
              
              // ФИНАЛЬНОЕ ОПРЕДЕЛЕНИЕ: Используем subscription_tier из БД, если есть, иначе из подписки, иначе дефолтный
              console.log("[getAvailableOrders] ========== ФИНАЛЬНОЕ ОПРЕДЕЛЕНИЕ subscription_tier ==========");
              console.log("[getAvailableOrders] user.subscription_tier (raw):", user.subscription_tier, "тип:", typeof user.subscription_tier);
              const userSubscriptionTier = user.subscription_tier && String(user.subscription_tier).trim() !== '' ? String(user.subscription_tier).trim() : null;
              console.log("[getAvailableOrders] userSubscriptionTier после обработки:", userSubscriptionTier);
              console.log("[getAvailableOrders] subscriptionTier (из подписки или дефолтный):", subscriptionTier);
              
              // Финальный subscription_tier: сначала из БД, потом из подписки/дефолтный
              const finalSubscriptionTier = userSubscriptionTier || subscriptionTier || "free_performer";
              
              // ГАРАНТИРУЕМ что finalSubscriptionTier всегда строка и не null
              const guaranteedSubscriptionTier = String(finalSubscriptionTier || "free_performer").trim();
              
              console.log("[getAvailableOrders] ✅ ФИНАЛЬНЫЙ subscription_tier:", guaranteedSubscriptionTier);
              console.log("[getAvailableOrders] Логика:", {
                user_subscription_tier: user.subscription_tier,
                userSubscriptionTier,
                subscriptionTier,
                finalSubscriptionTier,
                guaranteedSubscriptionTier,
                used_from: userSubscriptionTier ? "user.subscription_tier" : (subscriptionTier ? "subscription/default" : "hardcoded default")
              });
              console.log("[getAvailableOrders] ==============================================");
              
              // Формируем профиль пользователя (ТОЧНО КАК В getUserBalance)
              userProfile = {
                username: user.username || user.name || null, // ТОЧНО КАК В getUserBalance
                avatar_url: user.avatar_url || null,
                subscription_tier: guaranteedSubscriptionTier, // Используем guaranteedSubscriptionTier (гарантированно не null)
                subscription_id: user.subscription_id || null,
                subscription: subscriptionInfo,
                rating: user.rating !== null && user.rating !== undefined ? String(user.rating) : null
              };
              
              // Финальная проверка что subscription_tier установлен
              if (!userProfile.subscription_tier || userProfile.subscription_tier === null || userProfile.subscription_tier === undefined) {
                console.error("[getAvailableOrders] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier не установлен в userProfile! Принудительно устанавливаем 'free_performer'");
                userProfile.subscription_tier = "free_performer";
              }
              
              // Финальная проверка что subscription_tier установлен
              if (!userProfile.subscription_tier || userProfile.subscription_tier === null || userProfile.subscription_tier === undefined) {
                console.error("[getAvailableOrders] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier не установлен в userProfile! Принудительно устанавливаем 'free_performer'");
                userProfile.subscription_tier = "free_performer";
              }
              
              console.log("[getAvailableOrders] ✅ Профиль пользователя загружен:", {
                username: userProfile.username,
                subscription_tier: userProfile.subscription_tier,
                subscription_tier_type: typeof userProfile.subscription_tier,
                subscription_tier_is_null: userProfile.subscription_tier === null,
                subscription_tier_is_undefined: userProfile.subscription_tier === undefined,
                subscription_tier_value: String(userProfile.subscription_tier),
                has_subscription: !!userProfile.subscription,
                subscription_name: userProfile.subscription?.name
              });
            } else {
              console.warn("[getAvailableOrders] ⚠️ Пользователь не найден или ошибка:", {
                user_id: user_id,
                telegramId: telegramId,
                error: userErr?.message,
                error_code: userErr?.code
              });
              // Возвращаем дефолтный профиль, если пользователь не найден
              userProfile = {
                username: null,
                avatar_url: null,
                subscription_tier: "free_performer", // Дефолтный tier
                subscription_id: null,
                subscription: null,
                rating: null
              };
              console.log("[getAvailableOrders] Используем дефолтный профиль:", userProfile);
            }
          } else {
            console.warn("[getAvailableOrders] ⚠️ user_id не передан в запросе");
            // Возвращаем дефолтный профиль, если user_id не передан
            userProfile = {
              username: null,
              avatar_url: null,
              subscription_tier: "free_performer", // Дефолтный tier
              subscription_id: null,
              subscription: null,
              rating: null
            };
            console.log("[getAvailableOrders] Используем дефолтный профиль (user_id не передан):", userProfile);
          }
          
          console.log("[getAvailableOrders] ========== КОНЕЦ ЗАГРУЗКИ ПРОФИЛЯ ==========");
          console.log("[getAvailableOrders] Финальный userProfile:", userProfile ? {
            username: userProfile.username,
            subscription_tier: userProfile.subscription_tier,
            has_subscription: !!userProfile.subscription
          } : null);
          // Применяем фильтры
          let filteredByRating = filtered;
          // Фильтр по рейтингу логиста отключен (логисты не загружаются)
          // Фильтр по премиум заказам: показываем только если у пользователя gold подписка (priority_rank >= 2)
          // Всегда используем userTierRank из бэкенда, игнорируя filters.premium_access с фронтенда
          console.log("[getAvailableOrders] Фильтрация премиум заказов:", {
            userTierRank,
            premium_count: filteredByRating.filter((o)=>o.premium).length
          });
          if (userTierRank < 2) {
            // Пользователь без gold подписки - скрываем премиум заказы
            const beforeCount = filteredByRating.length;
            const premiumCount = filteredByRating.filter((o)=>o.premium).length;
            console.log("[getAvailableOrders] Пользователь без gold подписки (rank: " + userTierRank + "), скрываем премиум заказы");
            console.log("[getAvailableOrders] Премиум заказов до фильтрации:", premiumCount, "из", beforeCount);
            filteredByRating = filteredByRating.filter((o)=>!o.premium);
            console.log("[getAvailableOrders] Отфильтровано премиум заказов:", beforeCount - filteredByRating.length);
          } else {
            console.log("[getAvailableOrders] Пользователь имеет gold подписку (rank: " + userTierRank + "), показываем все заказы включая премиум");
          }
          console.log("[getAvailableOrders] После фильтрации премиум:", filteredByRating.length, "заказов");
          // Сортируем: premium + рамочки + логист priority_index (если есть) + по created_at
          filteredByRating.sort((a, b)=>{
            // premium first
            if ((b.premium ? 1 : 0) - (a.premium ? 1 : 0) !== 0) return (b.premium ? 1 : 0) - (a.premium ? 1 : 0);
            // then created_at desc
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          // Map minimal meta for list (short version of order includes metro)
          const shortOrders = filteredByRating.map((o)=>{
            // Парсим photos если они есть
            let parsedPhotos = null;
            if (o.photos) {
              try {
                parsedPhotos = typeof o.photos === 'string' 
                  ? JSON.parse(o.photos) 
                  : o.photos;
                if (!Array.isArray(parsedPhotos)) {
                  console.warn("[getAvailableOrders] photos не массив для заказа", o.id, ":", parsedPhotos);
                  parsedPhotos = null;
                }
              } catch (e) {
                console.warn("[getAvailableOrders] Ошибка парсинга photos для заказа", o.id, ":", e, "значение:", o.photos);
                parsedPhotos = null;
              }
            }
            
            return {
              id: o.id,
              title: o.title,
              description: o.description,
              location: o.location,
              metro_station: o.metro_station,
              premium: o.premium,
              duration_hours: o.duration_hours,
              wage_per_hour: o.wage_per_hour,
              deposit_amount: o.deposit_amount,
              required_slots: o.required_slots,
              created_at: o.created_at,
              photos: parsedPhotos,
              logist: null,
              created_by: null
            };
          });
          console.log("[getAvailableOrders] Итоговое количество заказов:", shortOrders.length);
          console.log("[getAvailableOrders] ========== ПРОВЕРКА ПЕРЕД ФОРМИРОВАНИЕМ ОТВЕТА ==========");
          console.log("[getAvailableOrders] userProfile перед финальной проверкой:", userProfile ? {
            username: userProfile.username,
            subscription_tier: userProfile.subscription_tier,
            subscription_tier_type: typeof userProfile.subscription_tier
          } : "NULL");
          
          // Финальная проверка - убеждаемся что userProfile всегда установлен
          if (!userProfile) {
            console.error("[getAvailableOrders] ❌ КРИТИЧЕСКАЯ ОШИБКА: userProfile все еще null! Устанавливаем дефолтный");
            userProfile = {
              username: null,
              avatar_url: null,
              subscription_tier: "free_performer", // Дефолтный tier
              subscription_id: null,
              subscription: null,
              rating: null
            };
          }
          
          // Гарантируем что subscription_tier не null и не пустая строка
          if (!userProfile.subscription_tier || userProfile.subscription_tier === null || userProfile.subscription_tier === undefined || String(userProfile.subscription_tier).trim() === '') {
            console.error("[getAvailableOrders] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier в userProfile невалидный! Устанавливаем дефолтный");
            console.error("[getAvailableOrders] Текущее значение subscription_tier:", userProfile.subscription_tier, "тип:", typeof userProfile.subscription_tier);
            userProfile.subscription_tier = "free_performer";
          }
          
          // Принудительно преобразуем subscription_tier в строку
          userProfile.subscription_tier = String(userProfile.subscription_tier).trim();
          
          console.log("[getAvailableOrders] userProfile после финальной проверки:", {
            username: userProfile.username,
            subscription_tier: userProfile.subscription_tier,
            subscription_tier_type: typeof userProfile.subscription_tier,
            subscription_tier_length: userProfile.subscription_tier.length
          });
          
          console.log("[getAvailableOrders] ✅ ФИНАЛЬНЫЙ профиль пользователя в ответе:", {
            username: userProfile.username,
            subscription_tier: userProfile.subscription_tier,
            subscription_tier_type: typeof userProfile.subscription_tier,
            subscription_tier_is_null: userProfile.subscription_tier === null,
            subscription_tier_is_undefined: userProfile.subscription_tier === undefined,
            has_subscription: !!userProfile.subscription,
            subscription_name: userProfile.subscription?.name
          });
          
          // ФИНАЛЬНАЯ ГАРАНТИЯ: subscription_tier всегда строка "free_performer" или больше
          if (userProfile && (!userProfile.subscription_tier || userProfile.subscription_tier === null || userProfile.subscription_tier === undefined || String(userProfile.subscription_tier).trim() === '')) {
            console.error("[getAvailableOrders] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier невалидный в userProfile перед формированием ответа! Принудительно устанавливаем 'free_performer'");
            userProfile.subscription_tier = "free_performer";
          }
          // Принудительно преобразуем в строку
          userProfile.subscription_tier = String(userProfile.subscription_tier || "free_performer").trim();
          
          // Формируем объект ответа
          const responseData = {
            success: true,
            orders: shortOrders,
            profile: userProfile // Добавляем профиль пользователя в ответ (гарантированно не null, subscription_tier гарантированно строка)
          };
          
          // Финальная проверка объекта ответа
          console.log("[getAvailableOrders] ========== ФИНАЛЬНАЯ ПРОВЕРКА ОТВЕТА ==========");
          console.log("[getAvailableOrders] responseData.profile существует:", !!responseData.profile);
          console.log("[getAvailableOrders] responseData.profile.subscription_tier:", responseData.profile?.subscription_tier);
          console.log("[getAvailableOrders] responseData.profile.subscription_tier тип:", typeof responseData.profile?.subscription_tier);
          console.log("[getAvailableOrders] responseData.profile.subscription_tier is null:", responseData.profile?.subscription_tier === null);
          console.log("[getAvailableOrders] responseData.profile.subscription_tier значение:", String(responseData.profile?.subscription_tier || "NULL"));
          console.log("[getAvailableOrders] Полный объект profile:", JSON.stringify(responseData.profile, null, 2));
          console.log("[getAvailableOrders] ==============================================");
          
          // Если subscription_tier все еще null в ответе, принудительно устанавливаем
          if (responseData.profile && (!responseData.profile.subscription_tier || responseData.profile.subscription_tier === null || responseData.profile.subscription_tier === undefined)) {
            console.error("[getAvailableOrders] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier null в responseData.profile! Принудительно устанавливаем 'free_performer'");
            responseData.profile.subscription_tier = "free_performer";
          }
          
          // Логируем полный JSON ответ перед отправкой (первые 2000 символов)
          const responseJson = JSON.stringify(responseData, null, 2);
          const responsePreview = responseJson.length > 2000 ? responseJson.substring(0, 2000) + "..." : responseJson;
          console.log("[getAvailableOrders] ========== ПОЛНЫЙ JSON ОТВЕТ (первые 2000 символов) ==========");
          console.log(responsePreview);
          console.log("[getAvailableOrders] Проверка profile в JSON:", responseJson.includes('"profile"'));
          console.log("[getAvailableOrders] Проверка subscription_tier в JSON:", responseJson.includes('"subscription_tier"'));
          const profileMatch = responseJson.match(/"profile":\s*\{[^}]*"subscription_tier":\s*"([^"]+)"/);
          if (profileMatch) {
            console.log("[getAvailableOrders] ✅ Найден subscription_tier в JSON:", profileMatch[1]);
          } else {
            console.error("[getAvailableOrders] ❌ subscription_tier НЕ НАЙДЕН в JSON ответе!");
          }
          console.log("[getAvailableOrders] ==============================================");
          
          return successResponse(responseData);
        }
      // ========== 2) Отклик на заказ (applyToOrder) ==========
      case "applyToOrder":
        {
          const { user_id, order_id } = body;
          if (!user_id || !order_id) return errorResponse("user_id and order_id required");
          console.log("[applyToOrder] user:", user_id, "order:", order_id);
          // Получаем заказ
          const { data: order, error: orderError } = await supabase.from("orders").select("id, deposit_amount, wage_per_hour, duration_hours, start_time, required_slots, status, collected_amount, premium, created_by").eq("id", order_id).single();
          if (orderError || !order) return errorResponse(`Order ${order_id} not found`);
          if (order.status !== "new" && order.status !== "in_progress") return errorResponse("This order is not open for responses");
          // Преобразуем в число, так как telegram_id в БД имеет тип bigint
          const userTelegramId = Number(user_id);
          console.log("[applyToOrder] Ищем пользователя с telegram_id:", userTelegramId, "тип:", typeof userTelegramId, "исходный user_id:", user_id, "тип исходного:", typeof user_id);
          // Получаем пользователя точно так же, как в getUserBalance (строка 1302) - используем select("*")
          const { data: user, error: userError } = await supabase.from("users").select("*").eq("telegram_id", userTelegramId).single();
          console.log("[applyToOrder] Результат поиска пользователя:", { 
            found: !!user, 
            error: userError?.message, 
            code: userError?.code,
            user_telegram_id: user?.telegram_id 
          });
          if (userError || !user) {
            console.error("[applyToOrder] Пользователь не найден. user_id:", user_id, "userTelegramId:", userTelegramId, "error:", userError?.message, "code:", userError?.code);
            return errorResponse(`User with telegram_id ${user_id} not found`);
          }
          
          // Проверка баланса - запрещаем отклики при отрицательном балансе
          const userBalance = Number(user.balance || 0);
          if (userBalance < 0) {
            console.log("[applyToOrder] ❌ Отрицательный баланс:", userBalance);
            return errorResponse("Невозможно откликнуться на заказ. У вас отрицательный баланс. Пополните баланс для продолжения работы.");
          }
          // Проверка лимитов по подписке
          const tier = getPerformerTier(user.subscription_tier);
          // daily_applies_count and active_jobs_count must be maintained (decrement when responses canceled / finished)
          const dailyCount = Number(user.daily_applies_count || 0);
          
          // Получаем реальное количество активных заказов из order_responses
          const { data: activeResponses, error: activeErr } = await supabase
            .from("order_responses")
            .select("id")
            .eq("user_id", userTelegramId)
            .in("status", ["accepted", "confirmed"]);
          
          if (activeErr) {
            console.error("[applyToOrder] Ошибка получения активных откликов:", activeErr);
            return errorResponse("Error checking active jobs");
          }
          
          const activeCount = activeResponses?.length || 0;
          console.log("[applyToOrder] Реальное количество активных заказов:", activeCount, "лимит:", tier.active_jobs_limit);
          
          if (dailyCount >= tier.daily_apply_limit) {
            return errorResponse(`Daily apply limit reached (${tier.daily_apply_limit}). Upgrade subscription to apply more.`);
          }
          if (activeCount >= tier.active_jobs_limit) {
            return errorResponse(`Active jobs limit reached (${tier.active_jobs_limit}). Finish some jobs or upgrade subscription.`);
          }
          // ИЗМЕНЕНИЕ: Отклик бесплатный, депозиты отменены
          // Комиссия будет списываться только при подтверждении участия (confirmResponse)
          // Обновляем только счетчик откликов - используем userTelegramId (как в getUserBalance)
          const { error: updateUserErr } = await supabase.from("users").update({
            daily_applies_count: dailyCount + 1
          }).eq("telegram_id", userTelegramId);
          if (updateUserErr) throw new Error(`Error updating user daily_applies_count: ${updateUserErr.message}`);
          // Создаем отклик используя userTelegramId
          const { data: response, error: responseError } = await supabase.from("order_responses").insert({
            order_id,
            user_id: userTelegramId,
            deposit_amount: 0,
            status: "pending",
            created_at: toISO(new Date())
          }).select().single();
          if (responseError) throw new Error(`Error creating response: ${responseError.message}`);
          // ИЗМЕНЕНИЕ: Не создаем транзакцию, так как отклик бесплатный
          // Create notification for logist about new response
          const { data: responderUser, error: responderUserErr } = await supabase.from("users").select("username").eq("telegram_id", userTelegramId).single();
          const responderName = responderUser?.username || `Исполнитель ${userTelegramId}`;
          const orderTitle = order.title || `Заказ #${order_id}`;
          const { error: notifErr } = await supabase.from("notifications").insert({
            user_id: order.created_by,
            payload: JSON.stringify({
              type: "new_response",
              order_id,
              responder_id: String(userTelegramId)
            }),
            message: `${responderName} откликнулся на заказ "${orderTitle}"`,
            read: false,
            is_read: false,
            created_at: toISO(new Date())
          });
          if (notifErr) console.error("[applyToOrder] notif err:", notifErr);
          return successResponse({
            success: true,
            response
          });
        }
      // ========== 2b) Быстрый отклик (quickApply) - доступен только для подписки с quick_apply ==========
      case "quickApply":
        {
          const { user_id, order_id } = body;
          if (!user_id || !order_id) return errorResponse("user_id and order_id required");
          // Преобразуем в число, так как telegram_id в БД имеет тип bigint
          const telegramId = Number(user_id);
          // Проверка подписки - ищем по telegram_id
          const { data: user, error: userErr } = await supabase.from("users").select("id, telegram_id, subscription_tier, balance, hold_balance, daily_applies_count, active_jobs_count").eq("telegram_id", telegramId).single();
          if (userErr || !user) return errorResponse(`User with telegram_id ${user_id} not found`);
          const tier = getPerformerTier(user.subscription_tier);
          if (!tier.quick_apply) return errorResponse("Quick apply is available only for paid subscriptions");
          // ИЗМЕНЕНИЕ: Quick apply тоже бесплатный, депозиты отменены
          // Комиссия будет списываться только при подтверждении участия (confirmResponse)
          // Обновляем только счетчик откликов
          const dailyCount = Number(user.daily_applies_count || 0);
          const { error: updateUserErr } = await supabase.from("users").update({
            daily_applies_count: dailyCount + 1
          }).eq("telegram_id", telegramId);
          if (updateUserErr) throw new Error(`Error updating user daily_applies_count: ${updateUserErr.message}`);
          // Создаем отклик используя telegram_id (число)
          const { data: response, error: responseError } = await supabase.from("order_responses").insert({
            order_id,
            user_id: telegramId,
            deposit_amount: 0,
            status: "pending",
            created_at: toISO(new Date())
          }).select().single();
          if (responseError) throw new Error(`Error creating quick response: ${responseError.message}`);
          // ИЗМЕНЕНИЕ: Не создаем транзакцию, так как quick apply бесплатный
          await supabase.from("notifications").insert({
            user_id: (await supabase.from("orders").select("created_by").eq("id", order_id).single()).data?.created_by,
            payload: JSON.stringify({
              type: "new_quick_response",
              order_id,
              responder_id: user_id
            }),
            read: false,
            is_read: false,
            created_at: toISO(new Date())
          });
          return successResponse({
            success: true,
            response
          });
        }
      // ========== 3) Получение откликов пользователя (history) ==========
      case "getUserResponses":
        {
          const { user_id } = body; // Теперь это telegram_id
          if (!user_id) return errorResponse("user_id (telegram_id) required");
          // Преобразуем в число, так как telegram_id в БД имеет тип bigint
          const telegramId = Number(user_id);
          // Используем telegram_id (число) для запросов к order_responses
          const { data: responses, error: responsesError } = await supabase.from("order_responses").select("id, status, deposit_amount, created_at, order_id").eq("user_id", telegramId).order("created_at", {
            ascending: false
          });
          if (responsesError) throw new Error(responsesError.message);
          // Получаем информацию о заказах отдельно (все поля для отображения в модале)
          const orderIds = [
            ...new Set((responses || []).map((r)=>r.order_id).filter(Boolean))
          ];
          let ordersMap = {};
          if (orderIds.length > 0) {
            // Получаем все поля заказа, включая те, что нужны для VacancyModal
            const { data: orders, error: ordersError } = await supabase.from("orders").select("*").in("id", orderIds);
            if (!ordersError && orders) {
              // Получаем количество откликов для каждого заказа
              const { data: responsesCounts, error: countsError } = await supabase
                .from("order_responses")
                .select("order_id")
                .in("order_id", orderIds);
              
              const countsMap = {};
              if (!countsError && responsesCounts) {
                responsesCounts.forEach((r) => {
                  countsMap[r.order_id] = (countsMap[r.order_id] || 0) + 1;
                });
              }
              
              // Получаем информацию о логистах (создателях заказов)
              const logistIds = [...new Set(orders.map((o) => o.created_by).filter(Boolean))];
              let logistsMap = {};
              if (logistIds.length > 0) {
                const { data: logists, error: logistsError } = await supabase
                  .from("users")
                  .select("telegram_id, username, subscription_tier, rating, frame, plaque")
                  .in("telegram_id", logistIds);
                
                if (!logistsError && logists) {
                  logistsMap = logists.reduce((acc, l) => {
                    acc[l.telegram_id] = l;
                    return acc;
                  }, {});
                }
              }
              
              ordersMap = orders.reduce((acc, o)=>{
                const logist = logistsMap[o.created_by] || null;
                acc[o.id] = {
                  ...o,
                  responses_count: countsMap[o.id] || 0,
                  logist: logist ? {
                    name: logist.username || null,
                    subscription_tier: logist.subscription_tier || null,
                    rating: logist.rating || null,
                    frame: logist.frame || null,
                    plaque: logist.plaque || null
                  } : null
                };
                return acc;
              }, {});
            }
          }
          // Форматируем ответы
          const formatted = (responses || []).map((r)=>{
            const order = ordersMap[r.order_id] || null;
            return {
              ...r,
              orders: order ? {
                ...order,
                order_status: order.status
              } : null
            };
          });
          return successResponse({
            success: true,
            responses: formatted
          });
        }
      // ========== 3b) Получение откликов на заказ (для логиста) ==========
      case "getOrderResponses":
        {
          const { order_id } = body;
          if (!order_id) return errorResponse("order_id required");
          // Получаем отклики на заказ
          const { data: responses, error: responsesError } = await supabase.from("order_responses").select("id, user_id, status, deposit_amount, created_at").eq("order_id", order_id).order("created_at", {
            ascending: false
          });
          if (responsesError) throw new Error(responsesError.message);
          // Получаем информацию о пользователях отдельно
          const userIds = [
            ...new Set((responses || []).map((r)=>Number(r.user_id)).filter(Boolean))
          ];
          console.log("[getOrderResponses] ID пользователей для загрузки:", userIds);
          console.log("[getOrderResponses] Responses:", responses?.map(r => ({ id: r.id, user_id: r.user_id, user_id_type: typeof r.user_id })));
          let usersMap = {};
          if (userIds.length > 0) {
            console.log("[getOrderResponses] Запрос пользователей с telegram_id:", userIds, "типы:", userIds.map(id => typeof id));
            // Пробуем загрузить пользователей - используем .in() с массивом чисел
            let users = null;
            let usersError = null;
            
            // Пробуем первый способ - прямой запрос
            const result = await supabase.from("users").select("id, username, rating, subscription_id, subscription_tier, telegram_id, avatar_url").in("telegram_id", userIds);
            users = result.data;
            usersError = result.error;
            
            // Если не получилось, пробуем загрузить по одному с разными типами
            if (usersError || !users || users.length === 0) {
              console.warn("[getOrderResponses] Первый запрос не дал результатов, пробуем загрузить по одному");
              const loadedUsers = [];
              for (const userId of userIds) {
                console.log(`[getOrderResponses] Запрос пользователя ${userId}, тип: ${typeof userId}`);
                
                // Пробуем как число
                let singleResult = await supabase.from("users").select("id, username, rating, subscription_id, subscription_tier, telegram_id, avatar_url").eq("telegram_id", Number(userId)).maybeSingle();
                
                // Если не нашли, пробуем как строку
                if (!singleResult.data && !singleResult.error) {
                  console.log(`[getOrderResponses] Пробуем найти ${userId} как строку`);
                  singleResult = await supabase.from("users").select("id, username, rating, subscription_id, subscription_tier, telegram_id, avatar_url").eq("telegram_id", String(userId)).maybeSingle();
                }
                
                // Если не нашли, пробуем как оригинальное значение
                if (!singleResult.data && !singleResult.error) {
                  console.log(`[getOrderResponses] Пробуем найти ${userId} как оригинальное значение`);
                  singleResult = await supabase.from("users").select("id, username, rating, subscription_id, subscription_tier, telegram_id, avatar_url").eq("telegram_id", userId).maybeSingle();
                }
                
                console.log(`[getOrderResponses] Результат для ${userId}:`, {
                  hasData: !!singleResult.data,
                  hasError: !!singleResult.error,
                  error: singleResult.error?.message,
                  data: singleResult.data ? {
                    telegram_id: singleResult.data.telegram_id,
                    telegram_id_type: typeof singleResult.data.telegram_id,
                    username: singleResult.data.username,
                    rating: singleResult.data.rating,
                    rating_type: typeof singleResult.data.rating
                  } : null
                });
                
                if (singleResult.data && !singleResult.error) {
                  loadedUsers.push(singleResult.data);
                  console.log(`[getOrderResponses] ✅ Пользователь ${userId} загружен, rating:`, singleResult.data.rating);
                } else if (singleResult.error) {
                  console.error(`[getOrderResponses] ❌ Ошибка загрузки пользователя ${userId}:`, singleResult.error);
                } else {
                  console.warn(`[getOrderResponses] ⚠️ Пользователь ${userId} не найден (нет данных и нет ошибки)`);
                }
              }
              if (loadedUsers.length > 0) {
                users = loadedUsers;
                usersError = null;
                console.log(`[getOrderResponses] ✅ Загружено ${loadedUsers.length} пользователей из ${userIds.length} запрошенных`);
              } else {
                console.warn(`[getOrderResponses] ⚠️ Не удалось загрузить ни одного пользователя из ${userIds.length} запрошенных`);
              }
            }
            
            console.log("[getOrderResponses] Загружено пользователей:", users?.length || 0, usersError ? `Ошибка: ${usersError?.message}` : "OK");
            if (usersError) {
              console.error("[getOrderResponses] Ошибка загрузки пользователей:", usersError);
            }
            if (users && users.length > 0) {
              console.log("[getOrderResponses] Данные пользователей:", users.map(u => ({
                telegram_id: u.telegram_id,
                telegram_id_type: typeof u.telegram_id,
                username: u.username,
                rating: u.rating
              })));
            } else {
              console.warn("[getOrderResponses] ⚠️ users is null or empty, userIds:", userIds);
            }
            if (!usersError && users) {
              // ИЗМЕНЕНИЕ: Получаем средние характеристики и подписку для каждого исполнителя
              for (const user of users){
                const telegramId = Number(user.telegram_id);
                console.log(`[getOrderResponses] ========== ОБРАБОТКА ПОЛЬЗОВАТЕЛЯ ${telegramId} ==========`);
                console.log(`[getOrderResponses] Исходные данные пользователя:`, {
                  telegram_id: user.telegram_id,
                  username: user.username,
                  subscription_id: user.subscription_id,
                  subscription_tier_from_db: user.subscription_tier,
                  subscription_tier_type: typeof user.subscription_tier
                });
                
                // ИЗМЕНЕНИЕ: Получаем характеристики исполнителя (role = "performer")
                const characteristics = await getAverageCharacteristics(supabase, telegramId, "performer");
                user.characteristics = characteristics;
                console.log(`[getOrderResponses] Характеристики для ${telegramId}:`, characteristics);
                
                // ИЗМЕНЕНИЕ: Загружаем информацию о подписке и определяем subscription_tier
                let subscriptionInfo = null;
                let subscriptionTier = null;
                
                // Сначала проверяем subscription_tier из БД
                // Проверяем что это не null, не undefined, и не пустая строка
                const dbSubscriptionTier = user.subscription_tier;
                if (dbSubscriptionTier !== null && dbSubscriptionTier !== undefined && String(dbSubscriptionTier).trim() !== '') {
                  subscriptionTier = String(dbSubscriptionTier).trim();
                  console.log(`[getOrderResponses] ✅ Используем subscription_tier из БД: "${subscriptionTier}" (тип: ${typeof dbSubscriptionTier})`);
                } else {
                  console.log(`[getOrderResponses] subscription_tier из БД пустой или null:`, {
                    value: dbSubscriptionTier,
                    type: typeof dbSubscriptionTier,
                    is_null: dbSubscriptionTier === null,
                    is_undefined: dbSubscriptionTier === undefined,
                    trimmed: dbSubscriptionTier ? String(dbSubscriptionTier).trim() : 'N/A'
                  });
                }
                
                if (user.subscription_id) {
                  const { data: subscriptionData, error: subError } = await supabase
                    .from("subscriptions")
                    .select("id, name, price, role, order_limit")
                    .eq("id", user.subscription_id)
                    .single();
                  
                  if (!subError && subscriptionData) {
                    subscriptionInfo = {
                      id: subscriptionData.id,
                      name: subscriptionData.name,
                      price: subscriptionData.price,
                      role: subscriptionData.role || "executor",
                      order_limit: subscriptionData.order_limit || 5
                    };
                    console.log(`[getOrderResponses] Подписка загружена для ${telegramId}:`, subscriptionInfo);
                    
                    // Определяем subscription_tier из подписки, если он еще не определен из БД
                    if (!subscriptionTier) {
                      // Маппинг по имени подписки
                      if (subscriptionData.role === "executor") {
                        const subscriptionName = (subscriptionData.name || "").toLowerCase();
                        if (subscriptionName.includes("basic") || subscriptionName.includes("free") || subscriptionName.includes("start")) {
                          subscriptionTier = "free_performer";
                          console.log(`[getOrderResponses] ✅ Определено как free_performer (по имени: ${subscriptionData.name})`);
                        } else if (subscriptionName.includes("silver")) {
                          subscriptionTier = "silver";
                          console.log(`[getOrderResponses] ✅ Определено как silver (по имени: ${subscriptionData.name})`);
                        } else if (subscriptionName.includes("gold")) {
                          subscriptionTier = "gold";
                          console.log(`[getOrderResponses] ✅ Определено как gold (по имени: ${subscriptionData.name})`);
                        } else if (subscriptionData.price === 0 || subscriptionData.price === null || subscriptionData.price === "0") {
                          subscriptionTier = "free_performer";
                          console.log(`[getOrderResponses] ✅ Определено как free_performer (цена = 0)`);
                        } else {
                          subscriptionTier = "silver";
                          console.log(`[getOrderResponses] ✅ Определено как silver (по умолчанию для платных)`);
                        }
                      }
                    } else {
                      console.log(`[getOrderResponses] subscription_tier уже определен из БД, не перезаписываем: ${subscriptionTier}`);
                    }
                  } else {
                    console.warn(`[getOrderResponses] Ошибка загрузки подписки для ${telegramId}:`, subError);
                  }
                }
                
                // Если subscription_tier все еще не определен, используем дефолтный
                if (!subscriptionTier) {
                  subscriptionTier = "free_performer"; // Дефолтный для исполнителей
                  console.log(`[getOrderResponses] ⚠️ subscription_tier не определен, используем дефолтный: ${subscriptionTier}`);
                }
                
                user.subscription = subscriptionInfo;
                user.subscription_tier = subscriptionTier; // Сохраняем subscription_tier в объект пользователя
                
                // Финальная проверка, что subscription_tier установлен
                if (user.subscription_tier !== subscriptionTier) {
                  console.error(`[getOrderResponses] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier не сохранен! Ожидалось: ${subscriptionTier}, получено: ${user.subscription_tier}`);
                  // Принудительно устанавливаем
                  user.subscription_tier = subscriptionTier;
                }
                
                console.log(`[getOrderResponses] ✅ ФИНАЛЬНЫЙ subscription_tier для ${telegramId}: ${subscriptionTier}`);
                console.log(`[getOrderResponses] Проверка сохранения в объект user:`, {
                  user_subscription_tier: user.subscription_tier,
                  user_subscription_tier_type: typeof user.subscription_tier,
                  user_subscription_tier_is_null: user.subscription_tier === null,
                  user_subscription_tier_is_undefined: user.subscription_tier === undefined,
                  subscription_name: user.subscription?.name,
                  subscription_id: user.subscription_id
                });
                console.log(`[getOrderResponses] ========== КОНЕЦ ОБРАБОТКИ ПОЛЬЗОВАТЕЛЯ ${telegramId} ==========`);
              }
              usersMap = users.reduce((acc, u)=>{
                // Используем telegram_id как ключ (может быть число или bigint)
                const key = Number(u.telegram_id);
                const keyStr = String(u.telegram_id);
                
                // Проверяем что subscription_tier есть в объекте перед добавлением в мапу
                if (!u.subscription_tier || u.subscription_tier === null || u.subscription_tier === undefined || String(u.subscription_tier).trim() === '') {
                  console.warn(`[getOrderResponses] ⚠️ subscription_tier отсутствует для пользователя ${u.telegram_id} перед добавлением в usersMap! Устанавливаем дефолтный.`);
                  u.subscription_tier = "free_performer";
                }
                
                acc[key] = u;
                acc[keyStr] = u; // Также добавляем строковый ключ для совместимости
                // Также добавляем все возможные варианты ключей
                if (u.telegram_id !== key) {
                  acc[u.telegram_id] = u;
                }
                return acc;
              }, {});
              console.log("[getOrderResponses] UsersMap keys:", Object.keys(usersMap));
              console.log("[getOrderResponses] UsersMap sample:", Object.entries(usersMap).slice(0, 2).map(([k, v]: [string, any]) => ({ 
                key: k, 
                key_type: typeof k, 
                telegram_id: v?.telegram_id,
                subscription_tier: v?.subscription_tier,
                subscription_tier_type: typeof v?.subscription_tier
              })));
              console.log("[getOrderResponses] UsersMap:", Object.keys(usersMap).length, "пользователей");
              
              // Финальная проверка всех пользователей в usersMap
              for (const [key, user] of Object.entries(usersMap)) {
                if (!user.subscription_tier || user.subscription_tier === null || user.subscription_tier === undefined) {
                  console.error(`[getOrderResponses] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier отсутствует в usersMap для ключа ${key}!`);
                  (user as any).subscription_tier = "free_performer";
                }
              }
            }
          }
          // Форматируем ответы
          const formatted = (responses || []).map((r)=>{
            const userId = Number(r.user_id);
            const userIdStr = String(r.user_id);
            // Пробуем найти пользователя разными способами
            const user = usersMap[userId] || usersMap[userIdStr] || usersMap[r.user_id] || null;
            if (!user) {
              console.warn(`[getOrderResponses] ⚠️ Пользователь не найден для user_id=${r.user_id} (Number: ${userId}, String: ${userIdStr})`);
              console.log(`[getOrderResponses] Доступные ключи в usersMap:`, Object.keys(usersMap));
              console.log(`[getOrderResponses] Типы ключей:`, Object.keys(usersMap).map(k => ({ key: k, type: typeof k })));
              // Если пользователь не найден, возвращаем ответ с user_id, но без данных пользователя
              return {
                ...r,
                users: null,
                rating: null // Явно указываем rating как null
              };
            }
            console.log(`[getOrderResponses] ========== ФОРМАТИРОВАНИЕ ОТВЕТА ${r.id} ==========`);
            console.log(`[getOrderResponses] Данные пользователя из usersMap:`, {
              telegram_id: user.telegram_id,
              username: user.username,
              rating: user.rating,
              avatar_url: user.avatar_url,
              subscription_id: user.subscription_id,
              subscription_tier: user.subscription_tier,
              subscription_tier_type: typeof user.subscription_tier,
              subscription_tier_is_null: user.subscription_tier === null,
              subscription_tier_is_undefined: user.subscription_tier === undefined,
              has_subscription: !!user.subscription,
              subscription_name: user.subscription?.name,
              has_characteristics: !!user.characteristics,
              characteristics_result: user.characteristics?.result
            });
            
            // subscription_tier уже определен и сохранен в объекте user выше
            // Используем его напрямую, гарантируя что он не null, не undefined и не пустая строка
            let subscriptionTier = user.subscription_tier;
            
            // Проверяем что subscription_tier валидный
            if (!subscriptionTier || subscriptionTier === null || subscriptionTier === undefined || String(subscriptionTier).trim() === '') {
              console.warn(`[getOrderResponses] ⚠️ subscription_tier в user невалидный: "${subscriptionTier}", используем дефолтный`);
              subscriptionTier = "free_performer";
            } else {
              subscriptionTier = String(subscriptionTier).trim();
            }
            
            console.log(`[getOrderResponses] subscriptionTier для userData: "${subscriptionTier}" (было в user: "${user.subscription_tier}")`);
            
            // Формируем объект пользователя с гарантированными полями
            const userData = {
              id: user.id,
              telegram_id: user.telegram_id,
              username: user.username || null,
              avatar_url: user.avatar_url || null,
              rating: user.rating !== null && user.rating !== undefined ? String(user.rating) : null,
              subscription_id: user.subscription_id || null,
              subscription_tier: subscriptionTier, // Гарантированно валидная строка, не null
              subscription: user.subscription || null,
              characteristics: user.characteristics || null
            };
            
            // Финальная проверка что subscription_tier в userData установлен
            if (!userData.subscription_tier || userData.subscription_tier === null || userData.subscription_tier === undefined) {
              console.error(`[getOrderResponses] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier в userData null! Принудительно устанавливаем "free_performer"`);
              userData.subscription_tier = "free_performer";
            }
            
            // Возвращаем ответ с данными пользователя
            const userRating = user.rating !== null && user.rating !== undefined ? String(user.rating) : null;
            console.log(`[getOrderResponses] Rating для user_id=${userId}:`, userRating, "тип:", typeof user.rating, "исходное значение:", user.rating);
            console.log(`[getOrderResponses] ✅ ФИНАЛЬНЫЙ UserData для user_id=${userId}:`, {
              username: userData.username,
              avatar_url: userData.avatar_url,
              subscription_tier: userData.subscription_tier,
              subscription_id: userData.subscription_id,
              has_subscription: !!userData.subscription,
              subscription_name: userData.subscription?.name,
              subscription_role: userData.subscription?.role
            });
            
            return {
              ...r,
              users: userData,
              rating: userRating // Явно добавляем rating в ответ
            };
          });
          console.log("[getOrderResponses] Итоговые отформатированные ответы:", formatted.length, "шт");
          
          // Финальная проверка всех ответов - убеждаемся что subscription_tier есть везде
          for (let i = 0; i < formatted.length; i++) {
            const response = formatted[i];
            if (response.users) {
              if (!response.users.subscription_tier || response.users.subscription_tier === null || response.users.subscription_tier === undefined) {
                console.error(`[getOrderResponses] ❌ КРИТИЧЕСКАЯ ОШИБКА: subscription_tier отсутствует в ответе ${i}! Принудительно устанавливаем "free_performer"`);
                response.users.subscription_tier = "free_performer";
              }
            }
          }
          
          // Логируем первый ответ для отладки
          if (formatted.length > 0) {
            console.log("[getOrderResponses] Первый ответ:", JSON.stringify({
              id: formatted[0].id,
              user_id: formatted[0].user_id,
              has_users: !!formatted[0].users,
              rating: formatted[0].rating,
              users_rating: formatted[0].users?.rating,
              users_subscription_tier: formatted[0].users?.subscription_tier,
              users_subscription_tier_type: typeof formatted[0].users?.subscription_tier,
              users_username: formatted[0].users?.username,
              users_avatar_url: formatted[0].users?.avatar_url,
              users_subscription_name: formatted[0].users?.subscription?.name
            }, null, 2));
          }
          
          // Финальная проверка перед возвратом
          const responsesWithUsers = formatted.filter(r => r.users !== null);
          const responsesWithoutSubscriptionTier = responsesWithUsers.filter(r => !r.users?.subscription_tier || r.users.subscription_tier === null || r.users.subscription_tier === undefined);
          if (responsesWithoutSubscriptionTier.length > 0) {
            console.error(`[getOrderResponses] ❌ КРИТИЧЕСКАЯ ОШИБКА: ${responsesWithoutSubscriptionTier.length} ответов без subscription_tier!`);
          } else {
            console.log(`[getOrderResponses] ✅ Все ${responsesWithUsers.length} ответов с пользователями имеют subscription_tier`);
          }
          
          // Сортируем ответы: сначала "В работе" (confirmed), потом "Ожидают подтверждения" (accepted), 
          // потом "Отклики отправленны" (pending), потом "Завершенные" (completed)
          // Внутри каждой категории сортируем по хронологии (новые сверху)
          const sortedFormatted = formatted.sort((a, b) => {
            // Определяем приоритет статусов
            const getStatusPriority = (status: string) => {
              if (status === 'confirmed') return 1; // В работе - первый
              if (status === 'accepted') return 2; // Ожидают подтверждения - второй
              if (status === 'pending') return 3; // Отклики отправленны - третий
              if (status === 'completed') return 4; // Завершенные - четвертый
              return 5; // Остальные статусы - последние
            };
            
            const priorityA = getStatusPriority(a.status);
            const priorityB = getStatusPriority(b.status);
            
            // Сначала сортируем по приоритету статуса
            if (priorityA !== priorityB) {
              return priorityA - priorityB;
            }
            
            // Если статусы одинаковые, сортируем по дате создания (новые сверху)
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return dateB - dateA; // Новые сверху
          });
          
          return successResponse({
            success: true,
            responses: sortedFormatted
          });
        }
      // ========== 3c) Отмена отклика (исполнитель отменяет свой отклик) ==========
      case "cancelResponse":
        {
          const { user_id, response_id } = body;
          if (!user_id || !response_id) return errorResponse("user_id and response_id required");
          
          const telegramId = Number(user_id);
          
          // Получаем отклик и проверяем, что он принадлежит пользователю
          const { data: response, error: responseErr } = await supabase
            .from("order_responses")
            .select("id, user_id, status, order_id")
            .eq("id", response_id)
            .eq("user_id", telegramId)
            .single();
          
          if (responseErr || !response) {
            return errorResponse("Response not found or you don't have permission to cancel it");
          }
          
          // Проверяем, что отклик можно отменить (не в статусе confirmed или completed)
          if (response.status === 'confirmed' || response.status === 'completed') {
            return errorResponse("Cannot cancel response with status " + response.status);
          }
          
          // Удаляем отклик
          const { error: deleteErr } = await supabase
            .from("order_responses")
            .delete()
            .eq("id", response_id)
            .eq("user_id", telegramId);
          
          if (deleteErr) {
            console.error("[cancelResponse] Ошибка удаления отклика:", deleteErr);
            return errorResponse("Failed to cancel response: " + deleteErr.message);
          }
          
          // Уменьшаем счетчик откликов пользователя
          const { data: user } = await supabase
            .from("users")
            .select("daily_applies_count")
            .eq("telegram_id", telegramId)
            .single();
          
          if (user) {
            const currentDailyCount = Number(user.daily_applies_count || 0);
            const newDailyCount = Math.max(0, currentDailyCount - 1);
            
            await supabase
              .from("users")
              .update({ daily_applies_count: newDailyCount })
              .eq("telegram_id", telegramId);
            
            console.log(`[cancelResponse] ✅ Отклик отменен, счетчик уменьшен для пользователя ${telegramId}, осталось: ${newDailyCount}`);
          }
          
          return successResponse({
            success: true,
            message: "Response cancelled successfully"
          });
        }
      // ========== 3c-2) Отмена заказа исполнителем (когда заказ в работе) ==========
      case "cancelOrderByPerformer":
        {
          const { user_id, order_id } = body;
          if (!user_id || !order_id) return errorResponse("user_id and order_id required");
          
          const telegramId = Number(user_id);
          
          // Получаем заказ и проверяем, что исполнитель участвует в нем
          const { data: order, error: orderErr } = await supabase
            .from("orders")
            .select("id, executor_ids, status, created_by, start_time, wage_per_hour, duration_hours, required_slots, collected_amount")
            .eq("id", order_id)
            .single();
          
          if (orderErr || !order) {
            return errorResponse("Order not found");
          }
          
          // Проверяем, что заказ в работе
          if (order.status !== 'in_progress' && order.status !== 'confirmed') {
            return errorResponse("Order is not in progress");
          }
          
          // Проверяем, что исполнитель в списке executor_ids
          const executorIds = (order.executor_ids || '').split(',').filter(Boolean).map(id => id.trim());
          if (!executorIds.includes(String(telegramId))) {
            return errorResponse("You are not a participant in this order");
          }
          
          // Получаем отклик исполнителя
          const { data: response, error: responseErr } = await supabase
            .from("order_responses")
            .select("id, user_id, status, order_id")
            .eq("order_id", order_id)
            .eq("user_id", telegramId)
            .eq("status", "confirmed")
            .single();
          
          if (responseErr || !response) {
            return errorResponse("Response not found or not confirmed");
          }
          
          // Рассчитываем время до начала заказа
          const startTime = new Date(order.start_time);
          const currentTime = now();
          const diffMs = startTime.getTime() - currentTime.getTime();
          const hoursUntilStart = diffMs / (1000 * 60 * 60);
          
          console.log("[cancelOrderByPerformer] Время до начала заказа:", hoursUntilStart, "часов");
          
          // Рассчитываем штраф
          const penalty = calculateCancellationPenalty(order, hoursUntilStart);
          
          console.log("[cancelOrderByPerformer] Расчёт штрафа:", penalty);
          
          // Получаем баланс исполнителя
          const { data: performer, error: performerErr } = await supabase
            .from("users")
            .select("balance")
            .eq("telegram_id", telegramId)
            .single();
          
          if (performerErr || !performer) {
            console.error("[cancelOrderByPerformer] ❌ Исполнитель не найден:", performerErr);
            return errorResponse("Performer not found");
          }
          
          const currentBalance = Number(performer.balance || 0);
          
          // Проверяем, достаточно ли средств для штрафа
          if (penalty.penaltyAmount > 0 && currentBalance < penalty.penaltyAmount) {
            console.error("[cancelOrderByPerformer] ❌ Недостаточно средств для штрафа:", {
              required: penalty.penaltyAmount,
              available: currentBalance
            });
            return errorResponse(`Недостаточно средств для оплаты штрафа. Требуется: ${penalty.penaltyAmount}₽, доступно: ${currentBalance}₽`);
          }
          
          // Применяем штраф, если он есть
          if (penalty.penaltyAmount > 0) {
            // Списываем штраф с баланса исполнителя
            const newPerformerBalance = currentBalance - penalty.penaltyAmount;
            
            const { error: updateBalanceErr } = await supabase
              .from("users")
              .update({ balance: newPerformerBalance.toString() })
              .eq("telegram_id", telegramId);
            
            if (updateBalanceErr) {
              console.error("[cancelOrderByPerformer] ❌ Ошибка списания штрафа:", updateBalanceErr);
              return errorResponse("Ошибка при списании штрафа");
            }
            
            // Создаём транзакцию штрафа
            await supabase.from("transactions").insert({
              user_id: telegramId,
              order_id,
              type: "penalty",
              amount: -penalty.penaltyAmount,
              description: `Штраф за отмену участия в заказе: ${penalty.reason}`,
              created_at: toISO(currentTime)
            });
            
            console.log(`[cancelOrderByPerformer] ✅ Списан штраф ${penalty.penaltyAmount}₽ с исполнителя`);
          }
          
          // Удаляем исполнителя из executor_ids
          const newExecutorIds = executorIds.filter(id => id !== String(telegramId)).join(',');
          
          const { error: updateOrderErr } = await supabase
            .from("orders")
            .update({ executor_ids: newExecutorIds || null })
            .eq("id", order_id);
          
          if (updateOrderErr) {
            console.error("[cancelOrderByPerformer] Ошибка обновления executor_ids:", updateOrderErr);
            return errorResponse("Failed to update order: " + updateOrderErr.message);
          }
          
          // Удаляем отклик исполнителя
          const { error: deleteResponseErr } = await supabase
            .from("order_responses")
            .delete()
            .eq("id", response.id);
          
          // Если исполнителей больше нет, возвращаем заказ в пул поиска
          if (newExecutorIds === '') {
            const { error: returnToPollErr } = await supabase
              .from("orders")
              .update({ 
                status: 'new',
                executor_ids: null 
              })
              .eq("id", order_id);
            
            if (returnToPollErr) {
              console.error("[cancelOrderByPerformer] ❌ Ошибка возврата заказа в пул:", returnToPollErr);
            } else {
              console.log("[cancelOrderByPerformer] ✅ Заказ возвращён в пул поиска");
            }
          }
          
          if (deleteResponseErr) {
            console.error("[cancelOrderByPerformer] Ошибка удаления отклика:", deleteResponseErr);
            return errorResponse("Failed to delete response: " + deleteResponseErr.message);
          }
          
          // Возвращаем отклик (уменьшаем счетчик)
          const { data: user } = await supabase
            .from("users")
            .select("daily_applies_count")
            .eq("telegram_id", telegramId)
            .single();
          
          if (user) {
            const currentDailyCount = Number(user.daily_applies_count || 0);
            const newDailyCount = Math.max(0, currentDailyCount - 1);
            
            await supabase
              .from("users")
              .update({ daily_applies_count: newDailyCount })
              .eq("telegram_id", telegramId);
          }
          
          // Уведомляем логиста
          const logistTelegramId = order.created_by;
          if (logistTelegramId) {
            const { data: performer } = await supabase
              .from("users")
              .select("username")
              .eq("telegram_id", telegramId)
              .single();
            
            const performerName = performer?.username || `Исполнитель ${telegramId}`;
            
            await createNotification(supabase, logistTelegramId, "performer_cancelled_order", {
              order_id: order_id,
              performer_id: telegramId,
              performer_name: performerName
            });
          }
          
          return successResponse({
            success: true,
            message: "Participation cancelled successfully",
            penalty: penalty.penaltyAmount > 0 ? {
              amount: penalty.penaltyAmount,
              reason: penalty.reason
            } : null
          });
        }
      // ========== 3d) Обновление статуса отклика (логист принимает исполнителя) ==========
      case "updateResponseStatus":
        {
          const { response_id, order_id, status } = body;
          if (!response_id || !order_id || !status) return errorResponse("response_id, order_id and status required");
          // Получаем отклик
          const { data: response, error: responseErr } = await supabase.from("order_responses").select("id, user_id, order_id, status").eq("id", response_id).eq("order_id", order_id).single();
          if (responseErr || !response) return errorResponse("Response not found");
          
          // Если статус меняется на "rejected" или "cancelled", возвращаем отклик
          if (status === "rejected" || status === "cancelled") {
            const responderTelegramId = Number(response.user_id);
            const { data: responderUser } = await supabase.from("users")
              .select("daily_applies_count")
              .eq("telegram_id", responderTelegramId)
              .single();
            
            if (responderUser) {
              const currentDailyCount = Number(responderUser.daily_applies_count || 0);
              const newDailyCount = Math.max(0, currentDailyCount - 1);
              await supabase.from("users").update({
                daily_applies_count: newDailyCount
              }).eq("telegram_id", responderTelegramId);
              console.log(`[updateResponseStatus] ✅ Возвращен отклик пользователю ${responderTelegramId}, осталось: ${newDailyCount}`);
            }
          }
          
          // Обновляем статус
          const { data: updated, error: updateErr } = await supabase.from("order_responses").update({
            status
          }).eq("id", response_id).select().single();
          if (updateErr) throw new Error(updateErr.message);
          // Если статус changed to "accepted", добавляем исполнителя в selected_executors заказа и создаем уведомление
          if (status === "accepted") {
            // При принятии исполнителя НЕ записываем в executor_ids - только при подтверждении
            // executor_ids заполняется только когда исполнитель подтверждает участие (confirmResponse)
            console.log(`[updateResponseStatus] Исполнитель ${response.user_id} принят, но еще не подтвердил. executor_ids будет обновлен при подтверждении.`);
            // Получаем информацию о заказе для уведомления
            const { data: orderInfo } = await supabase.from("orders").select("title").eq("id", order_id).single();
            // Создаем уведомление для исполнителя
            await createNotification(supabase, response.user_id, "response_accepted", {
              order_id,
              response_id,
              order_title: orderInfo?.title || `Заказ #${order_id}`
            });
          }
          return successResponse({
            success: true,
            response: updated
          });
        }
      // ========== 3d) Подтверждение отклика исполнителем ==========
      case "confirmResponse":
        {
          const { response_id, user_id } = body;
          if (!response_id || !user_id) return errorResponse("response_id and user_id required");
          // Получаем отклик
          const { data: response, error: responseErr } = await supabase.from("order_responses").select("id, user_id, order_id, status").eq("id", response_id).eq("user_id", user_id).single();
          if (responseErr || !response) return errorResponse("Response not found");
          if (response.status !== "accepted") {
            return errorResponse("Response is not in accepted status");
          }
          // Обновляем статус на "confirmed" (или другой статус, который означает, что исполнитель подтвердил)
          // Преобразуем в число, так как telegram_id в БД имеет тип bigint
          const telegramId = Number(user_id);
          console.log("[confirmResponse] Ищем пользователя с telegram_id:", telegramId, "тип:", typeof telegramId, "исходный user_id:", user_id, "тип исходного:", typeof user_id);
          // Получаем пользователя точно так же, как в getUserBalance (строка 1302) - используем select("*")
          const { data: user, error: userErr } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
          console.log("[confirmResponse] Результат поиска пользователя:", { 
            found: !!user, 
            error: userErr?.message, 
            code: userErr?.code,
            user_telegram_id: user?.telegram_id 
          });
          if (userErr || !user) {
            console.error("[confirmResponse] Пользователь не найден. user_id:", user_id, "telegramId:", telegramId, "error:", userErr?.message, "code:", userErr?.code);
            return errorResponse(`User with telegram_id ${user_id} not found`);
          }
          // Получаем информацию о заказе для расчета комиссии
          const orderId = response.order_id;
          const { data: orderInfo, error: orderInfoErr } = await supabase.from("orders").select("wage_per_hour, duration_hours, required_slots").eq("id", orderId).single();
          if (orderInfoErr || !orderInfo) {
            return errorResponse("Order not found");
          }
          // Рассчитываем комиссию: процент от суммы заказа на одного человека
          const wagePerHour = Number(orderInfo.wage_per_hour || 0);
          const durationHours = Number(orderInfo.duration_hours || 1);
          const perPersonAmount = wagePerHour * durationHours; // Сумма на одного человека
          const tier = getPerformerTier(user.subscription_tier);
          const commissionPercent = tier.commission_pct || 20; // Процент комиссии
          const commission = Math.round(perPersonAmount * commissionPercent / 100 * 100) / 100;
          console.log(`[confirmResponse] Расчет комиссии для пользователя ${telegramId}:`, {
            perPersonAmount,
            commissionPercent,
            commission,
            currentBalance: user.balance
          });
          // Проверяем баланс перед списанием комиссии
          const currentBalance = Number(user.balance || 0);
          if (currentBalance < commission) {
            return errorResponse(`Недостаточно средств на балансе. Требуется: ${commission}₽, доступно: ${currentBalance}₽`);
          }
          // Списываем комиссию с баланса
          const newBalance = currentBalance - commission;
          const { error: updateBalanceErr } = await supabase.from("users").update({
            balance: newBalance.toString()
          }).eq("telegram_id", telegramId);
          if (updateBalanceErr) {
            console.error("[confirmResponse] Ошибка списания комиссии:", updateBalanceErr);
            return errorResponse("Ошибка списания комиссии");
          }
          // Создаем транзакцию с типом platform_commission
          const { error: commissionTxErr } = await supabase.from("transactions").insert({
            user_id: telegramId,
            order_id: orderId,
            type: "platform_commission",
            amount: commission,
            description: `Комиссия за подтверждение участия в заказе #${orderId}`,
            created_at: toISO(new Date())
          });
          if (commissionTxErr) {
            console.error("[confirmResponse] Ошибка создания транзакции комиссии:", commissionTxErr);
            // Возвращаем деньги, если транзакция не создалась
            await supabase.from("users").update({
              balance: currentBalance.toString()
            }).eq("telegram_id", telegramId);
            return errorResponse("Ошибка создания транзакции комиссии");
          }
          console.log(`[confirmResponse] ✅ Комиссия ${commission}₽ списана с баланса пользователя ${telegramId}`);
          // Обновляем статус отклика на "confirmed"
          const { error: updateErr } = await supabase.from("order_responses").update({
            status: "confirmed"
          }).eq("id", response_id);
          if (updateErr) {
            // Если статус не обновился, возвращаем деньги
            await supabase.from("users").update({
              balance: currentBalance.toString()
            }).eq("telegram_id", telegramId);
            throw new Error(updateErr.message);
          }
          // ВОЗВРАЩАЕМ ОТКЛИК когда статус меняется на "confirmed"
          const currentDailyCount = Number(user.daily_applies_count || 0);
          const newDailyCount = Math.max(0, currentDailyCount - 1);
          await supabase.from("users").update({
            daily_applies_count: newDailyCount
          }).eq("telegram_id", telegramId);
          console.log(`[confirmResponse] ✅ Возвращен отклик пользователю ${telegramId} (статус changed to confirmed), осталось: ${newDailyCount}`);
          // ЗАПИСЫВАЕМ ID ИСПОЛНИТЕЛЯ В executor_ids ЗАКАЗА (через запятую) - ТОЛЬКО ПОДТВЕРДИВШИХ
          // orderId уже объявлен выше
          const { data: currentOrder, error: orderErr } = await supabase.from("orders").select("executor_ids, required_slots, wage_per_hour, duration_hours, created_by, logistic_id").eq("id", orderId).single();
          if (!orderErr && currentOrder) {
            // Получаем ВСЕХ подтвердивших исполнителей (status = "confirmed") для этого заказа
            const { data: allConfirmed, error: confirmedErr } = await supabase.from("order_responses").select("user_id").eq("order_id", orderId).eq("status", "confirmed");
            if (confirmedErr) {
              console.error("[confirmResponse] Ошибка получения подтвердивших исполнителей:", confirmedErr);
            } else {
              // Формируем список ID всех подтвердивших исполнителей
              const confirmedIds = (allConfirmed || []).map((r)=>Number(r.user_id)).filter((id)=>!isNaN(id) && id > 0);
              // Убеждаемся, что текущий исполнитель в списке
              if (!confirmedIds.includes(telegramId)) {
                confirmedIds.push(telegramId);
              }
              const newExecutorIds = confirmedIds.join(",");
              console.log(`[confirmResponse] Запись ID подтвердивших исполнителей в заказ ${orderId}:`, {
                confirmed_count: confirmedIds.length,
                confirmed_ids: confirmedIds,
                new_executor_ids: newExecutorIds
              });
              // Обновляем executor_ids - записываем всех подтвердивших
              const { error: updateExecutorIdsErr } = await supabase.from("orders").update({
                executor_ids: newExecutorIds
              }).eq("id", orderId);
              if (updateExecutorIdsErr) {
                console.error("[confirmResponse] ❌ Ошибка обновления executor_ids:", updateExecutorIdsErr);
                console.error("[confirmResponse] Детали ошибки:", {
                  message: updateExecutorIdsErr.message,
                  code: updateExecutorIdsErr.code,
                  details: updateExecutorIdsErr.details
                });
              } else {
                console.log("[confirmResponse] ✅ executor_ids обновлен успешно:", newExecutorIds);
                // Проверяем, что записалось
                const { data: verifyOrder } = await supabase.from("orders").select("executor_ids").eq("id", orderId).single();
                console.log("[confirmResponse] Проверка записи executor_ids:", {
                  requested: newExecutorIds,
                  actual: verifyOrder?.executor_ids
                });
              }
            }
            // Проверяем, все ли исполнители подтвердили, и меняем статус заказа
            const { data: allResponses } = await supabase.from("order_responses").select("status").eq("order_id", orderId).in("status", [
              "accepted",
              "confirmed"
            ]);
            const confirmedCount = (allResponses || []).filter((r)=>r.status === "confirmed").length;
            const requiredSlots = Number(currentOrder.required_slots || 1);
            console.log(`[confirmResponse] Подтверждено: ${confirmedCount}/${requiredSlots}`);
            // Если все исполнители подтвердили, меняем статус заказа на "in_progress"
            // Средства уже были зарезервированы при создании заказа
            if (confirmedCount >= requiredSlots) {
              // Обновляем статус заказа на "in_progress"
              const { error: updateOrderStatusErr } = await supabase.from("orders").update({
                status: "in_progress"
              }).eq("id", orderId);
              if (updateOrderStatusErr) {
                console.error("[confirmResponse] Ошибка обновления статуса заказа:", updateOrderStatusErr);
              } else {
                console.log("[confirmResponse] ✅ Статус заказа изменен на 'in_progress'");
                
                // ВОЗВРАЩАЕМ ОТКЛИКИ когда заказ переходит в "in_progress"
                // Получаем список выбранных исполнителей из executor_ids
                const executorIdsStr = currentOrder.executor_ids || "";
                const executorIds = executorIdsStr ? executorIdsStr.split(",").map(id => Number(id.trim())).filter(id => !isNaN(id) && id > 0) : [];
                
                // Возвращаем отклики тем, кто откликнулся, но не был выбран (pending, accepted)
                // Выбранные (confirmed) уже получили возврат отклика выше
                const { data: allResponsesForOrder } = await supabase.from("order_responses")
                  .select("user_id, status")
                  .eq("order_id", orderId)
                  .in("status", ["pending", "accepted"]);
                
                if (allResponsesForOrder && allResponsesForOrder.length > 0) {
                  for (const response of allResponsesForOrder) {
                    const responderTelegramId = Number(response.user_id);
                    if (!executorIds.includes(responderTelegramId)) {
                      // Уменьшаем daily_applies_count
                      const { data: responderUser } = await supabase.from("users")
                        .select("daily_applies_count")
                        .eq("telegram_id", responderTelegramId)
                        .single();
                      
                      if (responderUser) {
                        const currentDailyCount = Number(responderUser.daily_applies_count || 0);
                        const newDailyCount = Math.max(0, currentDailyCount - 1);
                        await supabase.from("users").update({
                          daily_applies_count: newDailyCount
                        }).eq("telegram_id", responderTelegramId);
                        console.log(`[confirmResponse] ✅ Возвращен отклик пользователю ${responderTelegramId} (заказ in_progress), осталось: ${newDailyCount}`);
                      }
                    }
                  }
                }
              }
            }
          }
          // Увеличиваем счетчик активных заказов
          if (user) {
            await supabase.from("users").update({
              active_jobs_count: (user.active_jobs_count || 0) + 1
            }).eq("telegram_id", telegramId);
          }
          // Создаем уведомление для логиста о подтверждении заказа
          const { data: orderForNotif, error: orderForNotifErr } = await supabase.from("orders").select("id, title, created_by").eq("id", orderId).single();
          if (!orderForNotifErr && orderForNotif && orderForNotif.created_by) {
            const { data: responderUser, error: responderUserErr } = await supabase.from("users").select("username").eq("telegram_id", telegramId).single();
            const responderName = responderUser?.username || `Исполнитель ${telegramId}`;
            await createNotification(supabase, orderForNotif.created_by, "order_confirmed", {
              order_id: orderId,
              responder_id: String(telegramId),
              responder_name: responderName,
              order_title: orderForNotif.title || `Заказ #${orderId}`
            });
          }
          return successResponse({
            success: true,
            message: "Response confirmed"
          });
        }
      // ========== 4) Баланс пользователя ==========
      case "getUserBalance":
        {
          const { user_id } = body; // Теперь это telegram_id
          if (!user_id) return errorResponse("user_id (telegram_id) required");
          // Преобразуем в число, так как telegram_id в БД имеет тип bigint
          const telegramId = Number(user_id);
          console.log(`[getUserBalance] ========== НАЧАЛО ЗАПРОСА ==========`);
          console.log(`[getUserBalance] user_id из запроса:`, user_id, `(тип: ${typeof user_id})`);
          console.log(`[getUserBalance] telegramId после преобразования:`, telegramId, `(тип: ${typeof telegramId})`);
          
          // Получаем пользователя по telegram_id - сначала без JOIN, чтобы не сломать запрос
          console.log(`[getUserBalance] Выполняю запрос к users...`);
          const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .single();
          
          console.log(`[getUserBalance] ========== РЕЗУЛЬТАТ ЗАПРОСА ==========`);
          console.log(`[getUserBalance] userError:`, userError);
          console.log(`[getUserBalance] user существует:`, !!user);
          if (user) {
            console.log(`[getUserBalance] Ключи объекта user:`, Object.keys(user));
            console.log(`[getUserBalance] user.id:`, user.id);
            console.log(`[getUserBalance] user.telegram_id:`, user.telegram_id);
            console.log(`[getUserBalance] user.username:`, user.username);
            console.log(`[getUserBalance] user.avatar_url:`, user.avatar_url);
            console.log(`[getUserBalance] user.subscription_id:`, user.subscription_id);
            console.log(`[getUserBalance] user.subscription_tier:`, user.subscription_tier, `(тип: ${typeof user.subscription_tier})`);
            console.log(`[getUserBalance] user.subscriptions:`, JSON.stringify(user.subscriptions, null, 2));
            console.log(`[getUserBalance] user.subscriptions тип:`, typeof user.subscriptions);
            console.log(`[getUserBalance] user.subscriptions является массивом:`, Array.isArray(user.subscriptions));
          }
          // Если пользователь не найден, возвращаем флаг user_not_found
          if (userError || !user) {
            console.warn(`[getUserBalance] User with telegram_id ${user_id} not found, error:`, userError);
            return successResponse({
              success: true,
              user_not_found: true,
              balance: {
                available: 0,
                frozen: 0,
                total: 0
              },
              transactions: []
            });
          }
          // Получаем транзакции используя telegram_id (число)
          const { data: transactions, error: transactionsError } = await supabase.from("transactions").select("*").eq("user_id", telegramId) // Используем числовой telegram_id
          .order("created_at", {
            ascending: false
          }).limit(50);
          if (transactionsError) console.error("transactions error", transactionsError);
          // Возвращаем баланс - используем значения из БД
          // balance может быть строкой или числом, поэтому парсим
          // В PostgreSQL numeric/decimal возвращается как строка
          let balance = 0;
          if (user.balance !== null && user.balance !== undefined) {
            if (typeof user.balance === 'string') {
              balance = parseFloat(user.balance) || 0;
            } else {
              balance = Number(user.balance) || 0;
            }
          }
          let holdBalance = 0;
          if (user.hold_balance !== null && user.hold_balance !== undefined) {
            if (typeof user.hold_balance === 'string') {
              holdBalance = parseFloat(user.hold_balance) || 0;
            } else {
              holdBalance = Number(user.hold_balance) || 0;
            }
          }
          console.log(`[getUserBalance] Parsed balance:`, {
            balance,
            holdBalance,
            rawBalance: user.balance,
            rawHoldBalance: user.hold_balance,
            balanceType: typeof user.balance,
            holdBalanceType: typeof user.hold_balance
          });
          console.log(`[getUserBalance] User username:`, user.username, `(type: ${typeof user.username})`);
          console.log(`[getUserBalance] User object keys:`, Object.keys(user));
          // ИЗМЕНЕНИЕ: Получаем средние характеристики для пользователя
          // telegramId уже объявлен выше на строке 1412, используем его
          // ИЗМЕНЕНИЕ: Определяем роль пользователя и получаем характеристики
          const userRole = user.role === "logistic" || user.role === "logist" ? "logist" : "performer";
          const characteristics = await getAverageCharacteristics(supabase, telegramId, userRole);
          console.log(`[getUserBalance] Характеристики пользователя ${telegramId}:`, characteristics);
          // Получаем рейтинг пользователя (0-100)
          const rating = Number(user.rating || 50);
          
          // Получаем информацию о подписке по subscription_id
          console.log(`[getUserBalance] ========== ОБРАБОТКА ПОДПИСКИ ==========`);
          let subscriptionInfo = null;
          let subscriptionTierFromSub = null;
          let subscription = null;
          
          // Загружаем подписку отдельным запросом
          if (user.subscription_id) {
            console.log(`[getUserBalance] Загружаю подписку по subscription_id:`, {
              subscription_id: user.subscription_id,
              subscription_id_type: typeof user.subscription_id,
              subscription_id_value: String(user.subscription_id)
            });
            
            // Преобразуем subscription_id в строку для надежности (UUID может быть в разных форматах)
            const subscriptionIdStr = String(user.subscription_id).trim();
            
            const { data: subscriptionData, error: subError } = await supabase
              .from("subscriptions")
              .select("id, name, price, role, order_limit")
              .eq("id", subscriptionIdStr)
              .single();
            
            if (!subError && subscriptionData) {
              subscription = subscriptionData;
              console.log(`[getUserBalance] Подписка загружена:`, {
                id: subscription.id,
                name: subscription.name,
                order_limit: subscription.order_limit,
                order_limit_type: typeof subscription.order_limit,
                order_limit_raw: subscription.order_limit
              });
            } else {
              console.error(`[getUserBalance] Ошибка загрузки подписки:`, {
                error: subError,
                subscription_id_used: subscriptionIdStr,
                subscription_id_original: user.subscription_id
              });
            }
          } else {
            console.log(`[getUserBalance] У пользователя нет subscription_id`);
          }
          
          if (subscription) {
            console.log(`[getUserBalance] subscription.id:`, subscription.id);
            console.log(`[getUserBalance] subscription.name:`, subscription.name);
            console.log(`[getUserBalance] subscription.price:`, subscription.price, `(тип: ${typeof subscription.price})`);
            console.log(`[getUserBalance] subscription.role:`, subscription.role);
            subscriptionInfo = {
              id: subscription.id,
              name: subscription.name,
              price: subscription.price,
              role: subscription.role || "logistic",
              order_limit: subscription.order_limit || 5
            };
            
            // Маппинг name подписки на tier_key для исполнителей
            if (subscription.role === "executor") {
              const subscriptionName = (subscription.name || "").toLowerCase();
              console.log(`[getUserBalance] Маппинг подписки для executor: name="${subscription.name}", price=${subscription.price}`);
              
              if (subscriptionName.includes("basic") || subscriptionName.includes("free") || subscriptionName.includes("start")) {
                subscriptionTierFromSub = "free_performer";
                console.log(`[getUserBalance] Определено как free_performer (по имени)`);
              } else if (subscriptionName.includes("silver")) {
                subscriptionTierFromSub = "silver";
                console.log(`[getUserBalance] Определено как silver (по имени)`);
              } else if (subscriptionName.includes("gold")) {
                subscriptionTierFromSub = "gold";
                console.log(`[getUserBalance] Определено как gold (по имени)`);
              } else if (subscription.price === 0 || subscription.price === null || subscription.price === "0") {
                // Если цена 0 или null, то это бесплатная подписка
                subscriptionTierFromSub = "free_performer";
                console.log(`[getUserBalance] Определено как free_performer (цена = 0)`);
              } else {
                // По умолчанию для платных подписок без явного указания
                subscriptionTierFromSub = "silver";
                console.log(`[getUserBalance] Определено как silver (по умолчанию для платных)`);
              }
            }
          }
          
          // Используем subscription_tier из users, если он есть, иначе берем tier_key из subscriptions
          // Проверяем, что subscription_tier не пустая строка
          console.log(`[getUserBalance] ========== ФИНАЛЬНОЕ ОПРЕДЕЛЕНИЕ ПОДПИСКИ ==========`);
          console.log(`[getUserBalance] user.subscription_tier (raw):`, user.subscription_tier, `(тип: ${typeof user.subscription_tier})`);
          const userSubscriptionTier = user.subscription_tier && user.subscription_tier.trim() !== '' ? user.subscription_tier : null;
          console.log(`[getUserBalance] userSubscriptionTier после обработки:`, userSubscriptionTier);
          console.log(`[getUserBalance] subscriptionTierFromSub:`, subscriptionTierFromSub);
          const finalSubscriptionTier = userSubscriptionTier || subscriptionTierFromSub || null;
          console.log(`[getUserBalance] finalSubscriptionTier:`, finalSubscriptionTier);
          
          console.log(`[getUserBalance] ========== ИТОГОВАЯ ИНФОРМАЦИЯ ==========`);
          console.log(`[getUserBalance] Определение подписки для пользователя ${telegramId}:`, {
            user_subscription_tier: user.subscription_tier,
            user_subscription_tier_trimmed: userSubscriptionTier,
            subscription_id: user.subscription_id,
            subscription_name: subscriptionInfo?.name,
            subscription_role: subscriptionInfo?.role,
            subscription_price: subscriptionInfo?.price,
            subscriptionTierFromSub,
            finalSubscriptionTier
          });
          
          // Проверяем и сбрасываем daily_collected_count если прошла полночь
          let dailyCollectedCount = Number(user.daily_collected_count || 0);
          const now = new Date();
          const lastResetDate = user.last_reset_date ? new Date(user.last_reset_date) : null;
          const shouldReset = !lastResetDate || 
            (now.getDate() !== lastResetDate.getDate() || 
             now.getMonth() !== lastResetDate.getMonth() || 
             now.getFullYear() !== lastResetDate.getFullYear());
          
          if (shouldReset && dailyCollectedCount > 0) {
            // Сбрасываем счетчик
            try {
              await supabase
                .from("users")
                .update({ 
                  daily_collected_count: 0,
                  last_reset_date: now.toISOString()
                })
                .eq("telegram_id", telegramId);
              dailyCollectedCount = 0;
              console.log(`[getUserBalance] Сброшен daily_collected_count для пользователя ${telegramId}`);
            } catch (updateErr) {
              // Если поле last_reset_date не существует, просто сбрасываем счетчик
              console.log(`[getUserBalance] Не удалось обновить last_reset_date, сбрасываем только счетчик`);
              try {
                await supabase
                  .from("users")
                  .update({ daily_collected_count: 0 })
                  .eq("telegram_id", telegramId);
                dailyCollectedCount = 0;
              } catch (e) {
                console.error(`[getUserBalance] Ошибка при сбросе счетчика:`, e);
              }
            }
          } else if (!lastResetDate) {
            // Устанавливаем дату сброса если её нет (но не падаем если поле отсутствует)
            try {
              await supabase
                .from("users")
                .update({ last_reset_date: now.toISOString() })
                .eq("telegram_id", telegramId);
            } catch (e) {
              console.log("[getUserBalance] Не удалось установить last_reset_date (поле может отсутствовать)");
            }
          }
          
          // Подсчитываем количество активных заказов (confirmed статус, не completed)
          const { data: activeOrdersResponses } = await supabase
            .from("order_responses")
            .select("id, status")
            .eq("user_id", telegramId)
            .eq("status", "confirmed");
          
          const activeOrdersCount = (activeOrdersResponses || []).length;
          
          // Подсчитываем общее количество заказов (все отклики пользователя)
          const { data: allUserResponses, error: allResponsesErr } = await supabase
            .from("order_responses")
            .select("id")
            .eq("user_id", telegramId);
          
          const totalOrdersCount = (allUserResponses || []).length;
          console.log(`[getUserBalance] Общее количество заказов (откликов): ${totalOrdersCount}`);
          
          // Подсчитываем количество текущих откликов (pending или accepted статусы)
          const { data: currentResponses } = await supabase
            .from("order_responses")
            .select("id, status")
            .eq("user_id", telegramId)
            .in("status", ["pending", "accepted"]);
          
          const currentResponsesCount = (currentResponses || []).length;
          
          // Рассчитываем заработанное с ТРУВО (сумма всех выполненных заказов)
          // Основной источник данных — payout_tasks, которые создаются в finalizeOrder
          let totalEarned = 0;
          const completedOrderTransactions: any[] = [];

          console.log(`[getUserBalance] ========== НАЧАЛО РАСЧЕТА totalEarned для user_id=${telegramId} ==========`);

          try {
            const { data: payoutTasks, error: payoutErr } = await supabase
              .from("payout_tasks")
              .select("order_id, gross_amount, created_at")
              .eq("user_id", telegramId);
            
            console.log(`[getUserBalance] Проверка payout_tasks:`, {
              found: payoutTasks?.length || 0,
              error: payoutErr?.message || null
            });

            // Проверяем, есть ли валидные payout_tasks с ненулевыми суммами
            const validPayoutTasks = payoutTasks?.filter((task) => {
              const gross = Number(task.gross_amount || 0);
              return gross > 0;
            }) || [];

            if (!payoutErr && validPayoutTasks.length > 0) {
              // Используем payout_tasks как основной источник
              validPayoutTasks.forEach((task)=>{
                const gross = Number(task.gross_amount || 0);
                totalEarned += gross;
                completedOrderTransactions.push({
                  id: `payout-${task.order_id}-${task.created_at || ''}`,
                  title: `Выплата за заказ #${task.order_id}`,
                  amount: gross,
                  type: "income",
                  timestamp: task.created_at || new Date().toISOString()
                });
              });

              console.log(`[getUserBalance] Расчет заработанного по payout_tasks:`, {
                tasks_count: validPayoutTasks.length,
                total_earned: totalEarned
              });
            } else {
              // Резервный расчет: по завершенным откликам и заказам
              console.log("[getUserBalance] payout_tasks не найдены или сумма = 0, используем резервный расчет по orders/order_responses:", payoutErr);
              
              // Ищем ВСЕ отклики пользователя (чтобы проверить все возможные статусы)
              const { data: allResponses, error: allResponsesError } = await supabase
                .from("order_responses")
                .select("order_id, status")
                .eq("user_id", telegramId);
              
              console.log("[getUserBalance] Все отклики пользователя:", {
                total: allResponses?.length || 0,
                error: allResponsesError?.message || null,
                statuses: allResponses?.map((r: any) => r.status) || []
              });
              
              // Ищем отклики со статусом "completed" (только завершенные заказы)
              const { data: completedResponses, error: completedResponsesError } = await supabase
                .from("order_responses")
                .select("order_id, status")
                .eq("user_id", telegramId)
                .eq("status", "completed");

              console.log("[getUserBalance] Поиск completed откликов:", {
                found: completedResponses?.length || 0,
                error: completedResponsesError?.message || null
              });

              // Также проверяем отклики со статусом "confirmed" для заказов со статусом "completed"
              const { data: confirmedResponses, error: confirmedResponsesError } = await supabase
                .from("order_responses")
                .select("order_id, status")
                .eq("user_id", telegramId)
                .eq("status", "confirmed");

              console.log("[getUserBalance] Поиск confirmed откликов:", {
                found: confirmedResponses?.length || 0,
                error: confirmedResponsesError?.message || null
              });

              // Объединяем completed и confirmed отклики
              const allCompletedOrderIds: string[] = [];
              if (completedResponses) {
                completedResponses.forEach((r: any) => {
                  if (r.order_id && !allCompletedOrderIds.includes(r.order_id)) {
                    allCompletedOrderIds.push(r.order_id);
                  }
                });
              }
              if (confirmedResponses) {
                confirmedResponses.forEach((r: any) => {
                  if (r.order_id && !allCompletedOrderIds.includes(r.order_id)) {
                    allCompletedOrderIds.push(r.order_id);
                  }
                });
              }
              
              console.log("[getUserBalance] Найдены отклики для расчета:", {
                completed_responses: completedResponses?.length || 0,
                confirmed_responses: confirmedResponses?.length || 0,
                unique_orders: allCompletedOrderIds.length,
                order_ids: allCompletedOrderIds
              });
              
              if (allCompletedOrderIds.length > 0) {
                // Получаем заказы
                const { data: completedOrders, error: completedOrdersError } = await supabase
                  .from("orders")
                  .select("id, wage_per_hour, duration_hours, updated_at, created_at, title, status, collected_amount, required_slots")
                  .in("id", allCompletedOrderIds);

                console.log("[getUserBalance] Заказы найдены:", {
                  found: completedOrders?.length || 0,
                  error: completedOrdersError?.message || null,
                  order_statuses: completedOrders?.map((o: any) => ({ id: o.id, status: o.status })) || []
                });

                if (!completedOrdersError && completedOrders && completedOrders.length > 0) {
                  completedOrders.forEach((order: any)=>{
                    // Берем заказы со статусом "completed" или где отклик "completed"
                    const orderStatus = (order.status || "").toString().trim().toLowerCase();
                    const isOrderCompleted = orderStatus === "completed";
                    
                    // Проверяем, есть ли completed отклик для этого заказа
                    const hasCompletedResponse = completedResponses?.some((r: any) => r.order_id === order.id);
                    
                    // Берем заказ если он завершен ИЛИ если есть completed отклик
                    if (!isOrderCompleted && !hasCompletedResponse) {
                      console.log(`[getUserBalance] Пропускаем заказ ${order.id} - не завершен и нет completed отклика (статус: ${order.status})`);
                      return;
                    }

                    const wagePerHour = Number(order.wage_per_hour || 0);
                    const durationHours = Number(order.duration_hours || 0);
                    const requiredSlots = Number(order.required_slots || 1) || 1;
                    const collectedAmount = Number(order.collected_amount || 0);

                    // Используем конечную стоимость заказа (общую, не за час и не делим на слоты)
                    // Если есть collected_amount - используем его (это общая стоимость заказа)
                    // Если нет - рассчитываем: wage_per_hour * duration_hours * required_slots (общая стоимость)
                    let orderTotal = 0;
                    if (collectedAmount > 0) {
                      orderTotal = collectedAmount;
                    } else {
                      orderTotal = wagePerHour * durationHours * requiredSlots;
                    }

                    orderTotal = Math.round(orderTotal * 100) / 100;
                    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
                      console.log(`[getUserBalance] Пропускаем заказ ${order.id} с нулевой суммой: ${orderTotal}`);
                      return;
                    }

                    console.log(`[getUserBalance] ✅ Добавляем заказ ${order.id}: ${orderTotal}₽ (wage: ${wagePerHour}, hours: ${durationHours}, collected: ${collectedAmount}, slots: ${requiredSlots}, total: ${orderTotal}, order_status: ${order.status}, has_completed_response: ${hasCompletedResponse})`);
                    totalEarned += orderTotal;
                    const timestamp = order.updated_at || order.created_at || new Date().toISOString();
                    completedOrderTransactions.push({
                      id: `order-${order.id}`,
                      title: order.title ? `Выплата за заказ «${order.title}»` : `Выплата за заказ #${order.id}`,
                      amount: orderTotal,
                      type: "income",
                      timestamp
                    });
                  });

                  console.log(`[getUserBalance] ✅ Расчет заработанного по orders/order_responses:`, {
                    completed_orders_count: completedOrders.length,
                    total_earned: totalEarned,
                    orders_details: completedOrders.map((o: any)=>({
                      id: o.id,
                      status: o.status,
                      wage_per_hour: o.wage_per_hour,
                      duration_hours: o.duration_hours,
                      required_slots: o.required_slots,
                      collected_amount: o.collected_amount,
                      total_order: (()=>{ 
                        const wagePerHour = Number(o.wage_per_hour || 0);
                        const durationHours = Number(o.duration_hours || 0);
                        const requiredSlots = Number(o.required_slots || 1) || 1;
                        const collectedAmount = Number(o.collected_amount || 0);
                        if (collectedAmount > 0) {
                          return collectedAmount;
                        }
                        return wagePerHour * durationHours * requiredSlots;
                      })()
                    }))
                  });
                } else {
                  console.log("[getUserBalance] ❌ Заказы не найдены:", {
                    error: completedOrdersError?.message || null,
                    found_orders: completedOrders?.length || 0,
                    requested_ids: allCompletedOrderIds
                  });
                }
              } else {
                console.log("[getUserBalance] ❌ Нет откликов для расчета:", {
                  completed_responses_error: completedResponsesError?.message || null,
                  confirmed_responses_error: confirmedResponsesError?.message || null,
                  found_completed: completedResponses?.length || 0,
                  found_confirmed: confirmedResponses?.length || 0
                });
                
                // Альтернативный подход: ищем заказы напрямую, где пользователь был в executor_ids
                console.log("[getUserBalance] Пробуем альтернативный подход: поиск заказов через executor_ids");
                const { data: ordersWithUser, error: ordersError } = await supabase
                  .from("orders")
                  .select("id, wage_per_hour, duration_hours, updated_at, created_at, title, status, collected_amount, required_slots, executor_ids")
                  .eq("status", "completed");
                
                // Фильтруем в коде, так как executor_ids может быть строкой или массивом
                const filteredOrders = ordersWithUser?.filter((order: any) => {
                  const executorIds = order.executor_ids;
                  if (!executorIds) return false;
                  
                  // Если это строка, проверяем содержит ли она наш telegramId
                  if (typeof executorIds === 'string') {
                    const idsArray = executorIds.split(',').map((id: string) => id.trim());
                    return idsArray.includes(String(telegramId));
                  }
                  
                  // Если это массив
                  if (Array.isArray(executorIds)) {
                    return executorIds.includes(telegramId) || executorIds.includes(String(telegramId));
                  }
                  
                  return false;
                }) || [];
                
                console.log("[getUserBalance] Заказы через executor_ids (после фильтрации):", {
                  found: filteredOrders.length,
                  error: ordersError?.message || null
                });
                
                console.log("[getUserBalance] Заказы через executor_ids:", {
                  found: ordersWithUser?.length || 0,
                  error: ordersError?.message || null
                });
                
                if (!ordersError && filteredOrders && filteredOrders.length > 0) {
                  filteredOrders.forEach((order: any)=>{
                    const wagePerHour = Number(order.wage_per_hour || 0);
                    const durationHours = Number(order.duration_hours || 0);
                    const requiredSlots = Number(order.required_slots || 1) || 1;
                    const collectedAmount = Number(order.collected_amount || 0);

                    let orderTotal = 0;
                    if (collectedAmount > 0) {
                      orderTotal = collectedAmount;
                    } else {
                      orderTotal = wagePerHour * durationHours * requiredSlots;
                    }

                    orderTotal = Math.round(orderTotal * 100) / 100;
                    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
                      console.log(`[getUserBalance] Пропускаем заказ ${order.id} с нулевой суммой: ${orderTotal}`);
                      return;
                    }

                    console.log(`[getUserBalance] ✅ Добавляем заказ через executor_ids ${order.id}: ${orderTotal}₽`);
                    totalEarned += orderTotal;
                    const timestamp = order.updated_at || order.created_at || new Date().toISOString();
                    completedOrderTransactions.push({
                      id: `order-${order.id}`,
                      title: order.title ? `Выплата за заказ «${order.title}»` : `Выплата за заказ #${order.id}`,
                      amount: orderTotal,
                      type: "income",
                      timestamp
                    });
                  });
                  
                  console.log(`[getUserBalance] ✅ Расчет через executor_ids: total_earned=${totalEarned}₽`);
                }
              }
            }
          } catch (e) {
            console.error("[getUserBalance] Ошибка при расчете totalEarned:", e);
          }
          
          console.log(`[getUserBalance] ========== ИТОГОВЫЙ totalEarned: ${totalEarned}₽ ==========`);
          
          // Получаем лимит откликов из подписки
          // ВАЖНО: order_limit используется только для исполнителей (executor/performer)
          // Для логистов это поле может означать другое или отсутствовать
          let dailyApplyLimit = 5; // дефолт
          
          // Проверяем роль пользователя - order_limit нужен только для исполнителей
          const isPerformer = userRole === "performer";
          
          if (subscription) {
            console.log(`[getUserBalance] Проверка order_limit в subscription:`, {
              user_role: userRole,
              user_role_from_db: user.role,
              is_performer: isPerformer,
              subscription_id: subscription.id,
              subscription_role: subscription.role,
              order_limit: subscription.order_limit,
              order_limit_type: typeof subscription.order_limit,
              order_limit_is_null: subscription.order_limit === null,
              order_limit_is_undefined: subscription.order_limit === undefined,
              order_limit_string: String(subscription.order_limit)
            });
            
            // Используем order_limit только если пользователь исполнитель И подписка для исполнителя
            if (isPerformer && (subscription.role === "executor" || !subscription.role)) {
              if (subscription.order_limit !== null && subscription.order_limit !== undefined) {
                // Преобразуем в число, так как из БД может прийти как строка
                const parsedLimit = Number(subscription.order_limit);
                if (!isNaN(parsedLimit) && parsedLimit > 0) {
                  dailyApplyLimit = parsedLimit;
                }
                console.log(`[getUserBalance] Лимит откликов из подписки (executor):`, {
                  order_limit_raw: subscription.order_limit,
                  order_limit_parsed: parsedLimit,
                  dailyApplyLimit,
                  subscription_id: subscription.id,
                  subscription_name: subscription.name,
                  subscription_role: subscription.role
                });
              } else {
                console.warn(`[getUserBalance] order_limit в подписке null/undefined для executor, используем дефолт:`, dailyApplyLimit);
              }
            } else {
              console.log(`[getUserBalance] Пользователь логист или подписка не для executor, order_limit не используется. Роль пользователя: ${userRole}, роль подписки: ${subscription.role}`);
              // Для логистов order_limit может быть не применим или означать другое
              dailyApplyLimit = 5; // дефолт для логистов
            }
          } else {
            console.log(`[getUserBalance] Подписка не найдена, используем дефолт:`, dailyApplyLimit);
          }
          
          // Форматируем транзакции для отображения
          const formatDate = (value: string | null | undefined) => {
            if (!value) return '';
            const dateObj = new Date(value);
            if (isNaN(dateObj.getTime())) return '';
            return dateObj.toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          };
          
          // Получаем заказы для транзакций, чтобы добавить названия
          const orderIdsFromTransactions: string[] = [];
          (transactions || []).forEach((tx: any) => {
            if (tx.order_id && !orderIdsFromTransactions.includes(tx.order_id)) {
              orderIdsFromTransactions.push(tx.order_id);
            }
          });
          let ordersMap: any = {};
          if (orderIdsFromTransactions.length > 0) {
            const { data: ordersData } = await supabase
              .from("orders")
              .select("id, title")
              .in("id", orderIdsFromTransactions);
            if (ordersData) {
              ordersMap = ordersData.reduce((acc: any, order: any) => {
                acc[order.id] = order;
                return acc;
              }, {});
            }
          }

          const formattedTransactions = (transactions || []).map((tx: any, index: number) => {
            const amount = Number(tx.amount || 0);
            // Комиссия всегда expense (красная с минусом)
            const isCommission = tx.type === 'platform_commission';
            const isIncome = !isCommission && amount >= 0;
            const title = tx.description || tx.type || 'Транзакция';
            const timestamp = tx.created_at || tx.date || null;
            const order = tx.order_id ? ordersMap[tx.order_id] : null;
            const orderTitle = order?.title || null;
            
            return {
              id: tx.id || `tx-${index}`,
              title,
              date: formatDate(timestamp),
              timestamp,
              amount: Math.abs(amount),
              type: isIncome ? 'income' : 'expense',
              icon: null,
              order_id: tx.order_id || null,
              order_title: orderTitle
            };
          });
          
          const completedOrderTransactionsFormatted = completedOrderTransactions.map((orderTx, idx) => ({
            id: orderTx.id || `order-tx-${idx}`,
            title: orderTx.title,
            date: formatDate(orderTx.timestamp),
            timestamp: orderTx.timestamp,
            amount: orderTx.amount,
            type: 'income',
            icon: null
          }));
          
          const allTransactions = [...formattedTransactions, ...completedOrderTransactionsFormatted].sort((a, b) => {
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return dateB - dateA;
          });
          
          const responseData = {
            success: true,
            balance: {
              available: balance,
              frozen: holdBalance,
              total: balance + holdBalance,
              total_earned: totalEarned // Заработанное с ТРУВО
            },
            transactions: allTransactions,
            user: {
              username: user.username || user.name || null,
              subscription_tier: finalSubscriptionTier,
              subscription_id: user.subscription_id || null,
              subscription: subscriptionInfo,
              daily_applies_count: user.daily_applies_count || 0,
              active_jobs_count: user.active_jobs_count || 0,
              daily_collected_count: dailyCollectedCount,
              rating: rating,
              characteristics: characteristics,
              avatar_url: user.avatar_url || null,
              // Добавляем счетчики для отображения на фронтенде
              active_orders_count: activeOrdersCount, // Количество активных заказов (confirmed)
              current_responses_count: currentResponsesCount, // Количество текущих откликов (pending + accepted)
              daily_apply_limit: dailyApplyLimit, // Лимит откликов в день
              total_orders_count: totalOrdersCount, // Общее количество заказов (все отклики)
              total_earned: totalEarned // Заработанное с ТРУВО
            }
          };
          
          console.log(`[getUserBalance] ========== ОТВЕТ ОТПРАВЛЯЕТСЯ ==========`);
          console.log(`[getUserBalance] responseData.user.username:`, responseData.user.username);
          console.log(`[getUserBalance] responseData.user.subscription_tier:`, responseData.user.subscription_tier);
          console.log(`[getUserBalance] responseData.user.avatar_url:`, responseData.user.avatar_url);
          console.log(`[getUserBalance] responseData.user.subscription_id:`, responseData.user.subscription_id);
          console.log(`[getUserBalance] Полный объект user в ответе:`, JSON.stringify(responseData.user, null, 2));
          console.log(`[getUserBalance] ========== КОНЕЦ ЗАПРОСА ==========`);
          
          return successResponse(responseData);
        }
      // ========== 5) Детали заказа (включая инфо о логисте / мини-профиль) ==========
      case "getOrderDetails":
        {
          const { order_id } = body;
          if (!order_id) return errorResponse("order_id required");
          // Получаем заказ
          const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", order_id).single();
          if (orderError || !order) return errorResponse(`Order ${order_id} not found`);
          // Получаем информацию о логисте отдельно
          let logist = null;
          if (order.created_by) {
            const logistTelegramId = Number(order.created_by);
            const { data: logistData, error: logistError } = await supabase.from("users").select("id, phone, company, frame, subscription_tier, rating, payout_method, payout_details").eq("telegram_id", logistTelegramId).single();
            if (!logistError && logistData) {
              logist = logistData;
            }
          }
          // Форматируем ответ
          const formatted = {
            ...order,
            logist: logist
          };
          return successResponse({
            success: true,
            order: formatted
          });
        }
      // ========== 4b) Получение данных пользователя по telegram_id ==========
      case "getUserByTelegramId":
        {
          const { telegram_id } = body;
          if (!telegram_id) return errorResponse("telegram_id required");
          const telegramId = Number(telegram_id);
          console.log(`[getUserByTelegramId] Поиск пользователя с telegram_id: ${telegram_id} (Number: ${telegramId}, тип: ${typeof telegramId})`);
          
          // Пробуем разные варианты запроса
          let user = null;
          let userError = null;
          
          // Пробуем как число
          let result = await supabase.from("users").select("id, username, rating, subscription_id, telegram_id, avatar_url").eq("telegram_id", telegramId).maybeSingle();
          user = result.data;
          userError = result.error;
          
          // Если не нашли, пробуем как строку
          if (!user && !userError) {
            console.log(`[getUserByTelegramId] Пробуем найти как строку: ${String(telegram_id)}`);
            result = await supabase.from("users").select("id, username, rating, subscription_id, telegram_id, avatar_url").eq("telegram_id", String(telegram_id)).maybeSingle();
            if (result.data && !result.error) {
              user = result.data;
              userError = null;
            }
          }
          
          // Если не нашли, пробуем как оригинальное значение
          if (!user && !userError) {
            console.log(`[getUserByTelegramId] Пробуем найти как оригинальное значение: ${telegram_id}`);
            result = await supabase.from("users").select("id, username, rating, subscription_id, telegram_id, avatar_url").eq("telegram_id", telegram_id).maybeSingle();
            if (result.data && !result.error) {
              user = result.data;
              userError = null;
            }
          }
          
          console.log(`[getUserByTelegramId] Результат поиска:`, {
            found: !!user,
            error: userError,
            telegram_id: user?.telegram_id,
            username: user?.username,
            rating: user?.rating
          });
          
          if (userError || !user) {
            console.warn(`[getUserByTelegramId] User with telegram_id ${telegram_id} not found, error:`, userError);
            return errorResponse("User not found");
          }
          // Получаем характеристики исполнителя
          const characteristics = await getAverageCharacteristics(supabase, telegramId, "performer");
          user.characteristics = characteristics;
          console.log(`[getUserByTelegramId] ✅ Пользователь найден, rating: ${user.rating}, characteristics:`, characteristics);
          return successResponse({
            success: true,
            user
          });
        }
      // ========== 5a) Получение сообщений чата заказа ==========
      case "getOrderMessages":
        {
          const { order_id } = body;
          if (!order_id) return errorResponse("order_id required");
          // Получаем заказ для проверки статуса
          const { data: order, error: orderError } = await supabase.from("orders").select("id, status, created_by, executor_ids").eq("id", order_id).single();
          if (orderError || !order) return errorResponse(`Order ${order_id} not found`);
          // Чат доступен для заказов в статусе "in_progress" или если есть подтвержденные исполнители
          const executorIds = (order.executor_ids || "").split(",").map((id)=>Number(id.trim())).filter((id)=>id);
          const hasConfirmedExecutors = executorIds.length > 0;
          const isInProgress = order.status === "in_progress";
          
          if (!isInProgress && !hasConfirmedExecutors) {
            return successResponse({
              success: true,
              messages: [],
              chat_available: false
            });
          }
          // Получаем сообщения чата - только нужные поля для ускорения
          const { data: messages, error: messagesError } = await supabase.from("order_messages").select("id, order_id, user_id, message, created_at").eq("order_id", order_id).order("created_at", {
            ascending: true
          }).limit(100);
          if (messagesError) {
            console.error("[getOrderMessages] Ошибка получения сообщений:", messagesError);
            return errorResponse("Ошибка получения сообщений");
          }
          // Если нет сообщений, возвращаем сразу
          if (!messages || messages.length === 0) {
            return successResponse({
              success: true,
              messages: [],
              chat_available: true
            });
          }
          // Получаем информацию о пользователях только если есть сообщения
          const userIds = [
            ...new Set(messages.map((m)=>m.user_id).filter((id)=>id))
          ];
          let usersMap = {};
          if (userIds.length > 0) {
            const { data: users, error: usersError } = await supabase.from("users").select("telegram_id, username").in("telegram_id", userIds);
            if (users) {
              users.forEach((u)=>{
                usersMap[u.telegram_id] = u.username || `User ${u.telegram_id}`;
              });
            }
          }
          // Добавляем имена пользователей к сообщениям
          const messagesWithUsers = messages.map((msg)=>({
              ...msg,
              user_name: usersMap[msg.user_id] || `User ${msg.user_id}`
            }));
          return successResponse({
            success: true,
            messages: messagesWithUsers,
            chat_available: true
          });
        }
      // ========== 5b) Отправка сообщения в чат заказа ==========
      case "sendOrderMessage":
        {
          const { order_id, user_id, message } = body;
          if (!order_id || !user_id || !message) {
            return errorResponse("order_id, user_id, and message required");
          }
          // Получаем заказ для проверки статуса и прав доступа
          const { data: order, error: orderError } = await supabase.from("orders").select("id, status, created_by, executor_ids").eq("id", order_id).single();
          if (orderError || !order) return errorResponse(`Order ${order_id} not found`);
          // Чат доступен для заказов в статусе "in_progress" или если есть подтвержденные исполнители
          const executorIds = (order.executor_ids || "").split(",").map((id)=>Number(id.trim())).filter((id)=>id);
          const hasConfirmedExecutors = executorIds.length > 0;
          const isInProgress = order.status === "in_progress";
          
          if (!isInProgress && !hasConfirmedExecutors) {
            return errorResponse("Чат доступен только для заказов в работе");
          }
          const userTelegramId = Number(user_id);
          // Проверяем, что пользователь имеет право писать в чат
          // Это может быть логист (создатель заказа) или исполнитель (в executor_ids)
          const isLogist = Number(order.created_by) === userTelegramId;
          const isExecutor = executorIds.includes(userTelegramId);
          if (!isLogist && !isExecutor) {
            return errorResponse("У вас нет доступа к чату этого заказа");
          }
          // Создаем сообщение
          const { data: newMessage, error: messageError } = await supabase.from("order_messages").insert({
            order_id,
            user_id: userTelegramId,
            message: message.trim(),
            created_at: toISO(new Date())
          }).select().single();
          if (messageError) {
            console.error("[sendOrderMessage] Ошибка создания сообщения:", messageError);
            return errorResponse("Ошибка отправки сообщения");
          }
          // Получаем имя пользователя
          const { data: user, error: userError } = await supabase.from("users").select("telegram_id, username").eq("telegram_id", userTelegramId).single();
          const messageWithUser = {
            ...newMessage,
            user_name: user?.username || `User ${userTelegramId}`
          };
          // Создаем уведомления для других участников чата
          const allExecutorIds = (order.executor_ids || "").split(",").map((id)=>Number(id.trim())).filter((id)=>id);
          const allParticipants = [Number(order.created_by), ...allExecutorIds].filter((id)=>id && id !== userTelegramId);
          const { data: orderForNotif, error: orderForNotifErr } = await supabase.from("orders").select("id, title").eq("id", order_id).single();
          const senderName = user?.username || `Пользователь ${userTelegramId}`;
          const orderTitle = orderForNotif?.title || `Заказ #${order_id}`;
          // Создаем уведомления для всех участников кроме отправителя
          console.log("[sendOrderMessage] Создаем уведомления для участников:", allParticipants, "отправитель:", userTelegramId);
          for (const participantId of allParticipants) {
            await createNotification(supabase, participantId, "new_message", {
              order_id: order_id,
              sender_id: String(userTelegramId),
              sender_name: senderName,
              order_title: orderTitle
            });
          }
          return successResponse({
            success: true,
            message: messageWithUser
          });
        }
      // ========== 5c) Получение заказов логиста ==========
      case "getLogistOrders":
        {
          const { logist_id } = body;
          if (!logist_id) return errorResponse("logist_id required");
          // Преобразуем в число - это telegram_id логиста
          const logistTelegramId = Number(logist_id);
          console.log("[getLogistOrders] Получение заказов для логиста с telegram_id:", logistTelegramId);
          // Сначала получаем ID пользователя (UUID) по telegram_id
          const { data: logistUser, error: logistUserError } = await supabase.from("users").select("id, telegram_id").eq("telegram_id", logistTelegramId).single();
          if (logistUserError || !logistUser) {
            console.error("[getLogistOrders] Логист не найден:", logistUserError);
            return errorResponse(`Logist with telegram_id ${logist_id} not found`);
          }
          const logistUserId = logistUser.id; // UUID пользователя
          console.log("[getLogistOrders] ID логиста (UUID):", logistUserId);
          // Получаем ВСЕ заказы и фильтруем СТРОГО по logistic_id
          const { data: allOrders, error: allOrdersError } = await supabase.from("orders").select("*").order("created_at", {
            ascending: false
          });
          if (allOrdersError) {
            throw new Error(allOrdersError.message);
          }
          console.log("[getLogistOrders] Всего заказов в БД:", allOrders?.length || 0);
          // ФИЛЬТРАЦИЯ ПО LOGISTIC_ID (UUID) или created_by (telegram_id) для совместимости
          const orders = [];
          (allOrders || []).forEach((o)=>{
            // Сначала проверяем по logistic_id (UUID) - приоритетный способ
            if (o.logistic_id && o.logistic_id === logistUserId) {
              orders.push(o);
              return;
            }
            // Если logistic_id не установлен или не совпадает, проверяем по created_by (telegram_id)
            // Это нужно для совместимости со старыми заказами или заказами без logistic_id
            if (o.created_by && Number(o.created_by) === logistTelegramId) {
              orders.push(o);
              return;
            }
          // Все остальное пропускаем
          });
          console.log("[getLogistOrders] После фильтрации по logistic_id:", {
            total_in_db: allOrders?.length || 0,
            filtered: orders.length,
            logist_user_id: logistUserId,
            logist_telegram_id: logistTelegramId
          });
          const ordersError = null;
          // orders уже отфильтрованы строго по logistic_id выше
          // ИСКЛЮЧАЕМ ОТМЕНЕННЫЕ ЗАКАЗЫ из списка
          const filteredOrders = orders.filter((o) => o.status !== "cancelled");
          console.log("[getLogistOrders] После исключения отмененных заказов:", {
            before: orders.length,
            after: filteredOrders.length,
            cancelled_count: orders.length - filteredOrders.length
          });
          // Получаем отклики для всех заказов
          const orderIds = filteredOrders.map((o)=>o.id);
          let responsesMap = {};
          if (orderIds.length > 0) {
            const { data: allResponses, error: responsesError } = await supabase.from("order_responses").select("id, order_id, user_id, status, created_at").in("order_id", orderIds);
            if (!responsesError && allResponses) {
              // Группируем отклики по заказам
              responsesMap = allResponses.reduce((acc, r)=>{
                if (!acc[r.order_id]) acc[r.order_id] = [];
                acc[r.order_id].push(r);
                return acc;
              }, {});
              // Получаем информацию о пользователях
              const userIds = [
                ...new Set(allResponses.map((r)=>Number(r.user_id)).filter(Boolean))
              ];
              console.log("[getLogistOrders] ID пользователей для загрузки:", userIds);
              if (userIds.length > 0) {
                const { data: users, error: usersError } = await supabase.from("users").select("id, username, rating, subscription_tier, completed_orders, telegram_id").in("telegram_id", userIds);
                console.log("[getLogistOrders] Загружено пользователей:", users?.length || 0, usersError ? `Ошибка: ${usersError.message}` : "OK");
                if (!usersError && users) {
                  const usersMap = users.reduce((acc, u)=>{
                    acc[u.telegram_id] = u;
                    return acc;
                  }, {});
                  console.log("[getLogistOrders] UsersMap создан:", Object.keys(usersMap).length, "пользователей");
                  // Добавляем информацию о пользователях к откликам
                  Object.keys(responsesMap).forEach((orderId)=>{
                    responsesMap[orderId] = responsesMap[orderId].map((r)=>{
                      const userData = usersMap[Number(r.user_id)] || null;
                      if (!userData) {
                        console.warn("[getLogistOrders] Пользователь не найден для user_id:", r.user_id, "telegram_id:", r.user_id);
                      }
                      return {
                        ...r,
                        users: userData
                      };
                    });
                  });
                }
              }
            }
          }
          // Форматируем заказы с откликами (используем отфильтрованные заказы)
          const formatted = filteredOrders.map((order)=>{
            // Парсим photos если они есть
            let parsedPhotos = null;
            console.log("[getLogistOrders] Обработка заказа:", order.id, "photos поле:", order.photos, "тип:", typeof order.photos);
            
            if (order.photos) {
              try {
                parsedPhotos = typeof order.photos === 'string' 
                  ? JSON.parse(order.photos) 
                  : order.photos;
                if (!Array.isArray(parsedPhotos)) {
                  console.warn("[getLogistOrders] photos не массив для заказа", order.id, ":", parsedPhotos);
                  parsedPhotos = null;
                } else {
                  console.log("[getLogistOrders] Успешно распарсили photos для заказа", order.id, "количество:", parsedPhotos.length);
                }
              } catch (e) {
                console.warn("[getLogistOrders] Ошибка парсинга photos для заказа", order.id, ":", e, "значение:", order.photos);
                parsedPhotos = null;
              }
            } else {
              console.log("[getLogistOrders] Нет photos для заказа", order.id, "order.photos:", order.photos);
            }
            
            const result = {
              ...order,
              photos: parsedPhotos, // Заменяем JSON строку на массив (или null если нет)
              responses: responsesMap[order.id] || []
            };
            
            // Логируем результат для отладки
            console.log("[getLogistOrders] Результат для заказа", order.id, "photos:", result.photos, "тип:", typeof result.photos, "isArray:", Array.isArray(result.photos));
            
            return result;
          });
          
          console.log("[getLogistOrders] Всего отформатировано заказов:", formatted.length);
          // Проверяем первый заказ с фото для отладки
          const orderWithPhotos = formatted.find(o => o.photos && Array.isArray(o.photos) && o.photos.length > 0);
          if (orderWithPhotos) {
            console.log("[getLogistOrders] Найден заказ с фото:", orderWithPhotos.id, "количество фото:", orderWithPhotos.photos.length);
          }
          
          return successResponse({
            success: true,
            orders: formatted
          });
        }
      // ========== 6) Создать заказ (логист) - включает новые поля, привязка по времени, premium, metro, filters ==========
      case "createOrder":
        {
          console.log("[createOrder] ========== НАЧАЛО СОЗДАНИЯ ЗАКАЗА ==========");
          console.log("[createOrder] body keys:", Object.keys(body));
          console.log("[createOrder] body values:", {
            created_by: body.created_by,
            title: body.title,
            start_time: body.start_time,
            has_photos: body.photos ? (Array.isArray(body.photos) ? body.photos.length : 'not array') : 'no photos'
          });
          
          const { created_by, title, description, location, metro_station, start_time, duration_hours, wage_per_hour, deposit_amount, required_slots = 1, premium = false, filters = {}, photos = [] } = body;
          
          if (!created_by || !title || !start_time) {
            console.error("[createOrder] ❌ Отсутствуют обязательные поля:", {
              created_by: !!created_by,
              title: !!title,
              start_time: !!start_time
            });
            return errorResponse("created_by, title and start_time required");
          }
          
          console.log("[createOrder] Получено фото:", photos?.length || 0);
          // Получаем информацию о логисте и проверяем лимиты
          const logistTelegramId = Number(created_by);
          console.log(`[createOrder] Получение информации о логисте telegram_id: ${logistTelegramId}`);
          
          // Пытаемся получить данные, включая last_reset_date (может отсутствовать)
          let logistQuery = supabase
            .from("users")
            .select("subscription_id, daily_collected_count, balance")
            .eq("telegram_id", logistTelegramId);
          
          const { data: logist, error: logistErr } = await logistQuery.single();
          
          if (logistErr || !logist) {
            console.error("[createOrder] Логист не найден:", logistErr);
            return errorResponse("Логист не найден");
          }
          
          // Проверка баланса - запрещаем создание заказов при отрицательном балансе
          const logistBalance = Number(logist.balance || 0);
          if (logistBalance < 0) {
            console.log("[createOrder] ❌ Отрицательный баланс у логиста:", logistBalance);
            return errorResponse("Невозможно создать заказ. У вас отрицательный баланс. Пополните баланс для продолжения работы.");
          }
          
          // Пытаемся получить last_reset_date отдельно (если поле существует)
          let lastResetDate = null;
          try {
            const { data: userWithReset, error: resetErr } = await supabase
              .from("users")
              .select("last_reset_date")
              .eq("telegram_id", logistTelegramId)
              .single();
            
            if (!resetErr && userWithReset?.last_reset_date) {
              lastResetDate = new Date(userWithReset.last_reset_date);
            }
          } catch (e) {
            console.log("[createOrder] Поле last_reset_date отсутствует или недоступно, используем null");
          }
          
          // Проверяем и сбрасываем daily_collected_count если прошла полночь
          let dailyCollected = Number(logist.daily_collected_count || 0);
          const now = new Date();
          const shouldReset = !lastResetDate || 
            (now.getDate() !== lastResetDate.getDate() || 
             now.getMonth() !== lastResetDate.getMonth() || 
             now.getFullYear() !== lastResetDate.getFullYear());
          
          if (shouldReset && dailyCollected > 0) {
            // Пытаемся обновить, но не падаем если поле отсутствует
            try {
              await supabase
                .from("users")
                .update({ 
                  daily_collected_count: 0,
                  last_reset_date: now.toISOString()
                })
                .eq("telegram_id", logistTelegramId);
              dailyCollected = 0;
              console.log(`[createOrder] Сброшен daily_collected_count для пользователя ${logistTelegramId}`);
            } catch (updateErr) {
              // Если поле last_reset_date не существует, просто сбрасываем счетчик
              console.log(`[createOrder] Не удалось обновить last_reset_date, сбрасываем только счетчик`);
              await supabase
                .from("users")
                .update({ daily_collected_count: 0 })
                .eq("telegram_id", logistTelegramId);
              dailyCollected = 0;
            }
          } else if (!lastResetDate) {
            // Устанавливаем дату сброса если её нет (но не падаем если поле отсутствует)
            try {
              await supabase
                .from("users")
                .update({ last_reset_date: now.toISOString() })
                .eq("telegram_id", logistTelegramId);
            } catch (e) {
              console.log("[createOrder] Не удалось установить last_reset_date (поле может отсутствовать)");
            }
          }
          
          // Получаем информацию о подписке
          let orderLimit = 5; // По умолчанию
          if (logist.subscription_id) {
            const { data: subscription, error: subError } = await supabase
              .from("subscriptions")
              .select("order_limit")
              .eq("id", logist.subscription_id)
              .single();
            
            if (!subError && subscription) {
              orderLimit = subscription.order_limit || 5;
            }
          }
          
          // Проверяем лимит создания заказов
          if (dailyCollected >= orderLimit) {
            return errorResponse(`Достигнут дневной лимит создания заказов (${orderLimit}). Попробуйте завтра.`);
          }
          // Получаем ID логиста (UUID) по telegram_id для поля logistic_id
          // ИЗМЕНЕНИЕ: С логистов ничего не берем при создании заказа
          // Проверяем только баланс - если <= 0, блокируем работу (проверка на фронтенде)
          const { data: logistUser, error: logistUserErr } = await supabase.from("users").select("id, balance").eq("telegram_id", logistTelegramId).single();
          if (logistUserErr || !logistUser) {
            return errorResponse(`Logist with telegram_id ${created_by} not found`);
          }
          // Рассчитываем сумму заказа (только для информации, не для списания)
          const wagePerHour = Number(wage_per_hour || 0);
          const durationHours = Number(duration_hours || 1);
          const requiredSlotsNum = Number(required_slots || 1);
          const totalAmount = wagePerHour * durationHours * requiredSlotsNum;
          console.log(`[createOrder] Расчет суммы заказа:`, {
            wagePerHour,
            durationHours,
            requiredSlotsNum,
            totalAmount
          });
          // ИЗМЕНЕНИЕ: Не списываем деньги с логиста, только проверяем баланс (блокировка на фронтенде)
          const currentBalance = Number(logistUser.balance || 0);
          console.log(`[createOrder] Баланс логиста ${logistTelegramId}: ${currentBalance}₽ (не списываем)`);
          // Загружаем фото в Supabase Storage если они есть
          let photoUrls = [];
          if (photos && photos.length > 0) {
            console.log("[createOrder] Начинаем загрузку", photos.length, "фото в Storage");
            console.log("[createOrder] Тип photos:", typeof photos, Array.isArray(photos));
            console.log("[createOrder] Первый элемент:", photos[0], "тип:", typeof photos[0]);
            
            const orderIdForStorage = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            // Максимальный размер файла: 10 МБ (10485760 байт)
            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ
            
            // Загружаем все фото последовательно
            for (let i = 0; i < photos.length; i++) {
              const photo = photos[i];
              console.log(`[createOrder] ========== Обработка фото ${i + 1}/${photos.length} ==========`);
              console.log(`[createOrder] Обработка фото ${i}:`, {
                valueType: typeof photo,
                isFile: photo instanceof File,
                isBlob: photo instanceof Blob,
                hasArrayBuffer: typeof photo.arrayBuffer === 'function',
                name: photo?.name || 'unknown',
                size: photo?.size || 0,
                mimeType: photo?.type || 'unknown'
              });
              
              if (!photo) {
                console.error(`[createOrder] Фото ${i} отсутствует (null/undefined)`);
                continue;
              }
              
              // Проверяем размер файла ПЕРЕД загрузкой
              const fileSize = photo.size || 0;
              if (fileSize > MAX_FILE_SIZE) {
                const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
                const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
                console.error(`[createOrder] ❌ Фото ${i} слишком большое: ${sizeMB} МБ (максимум ${maxMB} МБ), пропускаем`);
                continue;
              }
              
              try {
                // В Deno Edge Functions FormData возвращает File объекты
                let fileData = null;
                let fileName = `photo_${i}.jpg`;
                let contentType = 'image/jpeg';
                
                // Получаем данные файла
                if (photo instanceof File) {
                  fileData = await photo.arrayBuffer();
                  fileName = photo.name || fileName;
                  contentType = photo.type || contentType;
                  console.log(`[createOrder] Фото ${i} - File объект, размер:`, fileData.byteLength, "байт, имя:", fileName);
                } else if (photo instanceof Blob) {
                  fileData = await photo.arrayBuffer();
                  contentType = photo.type || contentType;
                  console.log(`[createOrder] Фото ${i} - Blob объект, размер:`, fileData.byteLength, "байт");
                } else if (typeof photo.arrayBuffer === 'function') {
                  // Пробуем вызвать arrayBuffer если есть такой метод
                  fileData = await photo.arrayBuffer();
                  fileName = photo.name || fileName;
                  contentType = photo.type || contentType;
                  console.log(`[createOrder] Фото ${i} - объект с arrayBuffer, размер:`, fileData.byteLength, "байт");
                } else {
                  console.error(`[createOrder] Неизвестный тип файла для фото ${i}:`, typeof photo, photo);
                  continue;
                }
                
                if (!fileData || fileData.byteLength === 0) {
                  console.error(`[createOrder] Пустые данные файла для фото ${i}`);
                  continue;
                }
                
                // Дополнительная проверка размера после получения данных
                if (fileData.byteLength > MAX_FILE_SIZE) {
                  const sizeMB = (fileData.byteLength / (1024 * 1024)).toFixed(2);
                  const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
                  console.error(`[createOrder] ❌ Фото ${i} слишком большое после загрузки: ${sizeMB} МБ (максимум ${maxMB} МБ), пропускаем`);
                  continue;
                }
                
                // Получаем расширение файла
                let fileExt = 'jpg';
                if (fileName) {
                  const ext = fileName.split('.').pop();
                  if (ext && ext.length <= 5 && !ext.includes('/')) {
                    fileExt = ext.toLowerCase();
                  }
                }
                
                const storageFileName = `${orderIdForStorage}_${i}.${fileExt}`;
                const filePath = `order-photos/${storageFileName}`;
                
                console.log(`[createOrder] Загрузка фото ${i} в путь:`, filePath, "contentType:", contentType, "размер:", fileData.byteLength);
                
                // Загружаем в Storage как Uint8Array
                const uint8Array = new Uint8Array(fileData);
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('order-photos')
                  .upload(filePath, uint8Array, {
                    contentType: contentType,
                    upsert: false
                  });
                
                if (uploadError) {
                  console.error(`[createOrder] ❌ Ошибка загрузки фото ${i}:`, uploadError);
                  console.error(`[createOrder] Детали ошибки:`, JSON.stringify(uploadError, null, 2));
                  // НЕ продолжаем - это критическая ошибка, нужно знать о ней
                } else {
                  console.log(`[createOrder] ✅ Фото ${i} успешно загружено в Storage`);
                  
                  // Получаем публичный URL
                  const { data: urlData } = supabase.storage
                    .from('order-photos')
                    .getPublicUrl(filePath);
                  
                  if (urlData?.publicUrl) {
                    photoUrls.push(urlData.publicUrl);
                    console.log(`[createOrder] ✅ Фото ${i} URL добавлен:`, urlData.publicUrl);
                  } else {
                    console.error(`[createOrder] ❌ Не удалось получить публичный URL для фото ${i}`);
                  }
                }
              } catch (photoErr) {
                console.error(`[createOrder] ❌ Исключение при загрузке фото ${i}:`, photoErr);
                console.error(`[createOrder] Stack trace:`, photoErr.stack);
                // Продолжаем обработку остальных фото
              }
            }
            console.log("[createOrder] ========== ИТОГО: загружено фото:", photoUrls.length, "из", photos.length, "URLs:", photoUrls);
            
            // Предупреждение, если не все фото загрузились
            if (photoUrls.length < photos.length) {
              const skipped = photos.length - photoUrls.length;
              console.warn(`[createOrder] ⚠️ ВНИМАНИЕ: ${skipped} фото не загружено из ${photos.length} (возможно, превышен размер файла > 10 МБ)`);
            }
          } else {
            console.log("[createOrder] Фото не переданы или массив пуст");
          }
          
          // Создаем запись заказа
          // Убеждаемся, что premium - это булево значение
          const premiumValue = premium === true || premium === "true" || premium === 1;
          console.log("[createOrder] Создание заказа с premium:", premiumValue, "(исходное значение:", premium, ")");
          const { data: order, error: orderErr } = await supabase.from("orders").insert({
            created_by,
            logistic_id: logistUser.id,
            title,
            description,
            location,
            metro_station,
            start_time,
            duration_hours,
            wage_per_hour,
            deposit_amount: 0,
            required_slots,
            premium: premiumValue,
            filters: filters,
            status: "new",
            collected_amount: totalAmount.toString(),
            photos: photoUrls.length > 0 ? JSON.stringify(photoUrls) : null, // Сохраняем массив URL как JSON строку
            created_at: toISO(new Date())
          }).select().single();
          if (orderErr) {
            console.error("[createOrder] Ошибка создания заказа:", orderErr);
            throw new Error(orderErr.message);
          }
          console.log("[createOrder] Заказ создан успешно:", {
            id: order.id,
            title: order.title,
            premium: order.premium,
            photos_count: photoUrls.length
          });
          
          // Увеличиваем daily_collected_count после успешного создания заказа
          await supabase
            .from("users")
            .update({ 
              daily_collected_count: dailyCollected + 1
            })
            .eq("telegram_id", logistTelegramId);
          console.log(`[createOrder] Обновлен daily_collected_count: ${dailyCollected + 1}`);
          
          // ИЗМЕНЕНИЕ: Не создаем транзакцию, так как с логистов ничего не берем
          return successResponse({
            success: true,
            order: {
              ...order,
              photos: photoUrls // Добавляем фото в ответ
            }
          });
        }
      // ========== 7) Отмена заказа логистом (со штрафами и распределением) ==========
      case "cancelOrderByLogist":
        {
          const { order_id, logist_id } = body;
          if (!order_id || !logist_id) return errorResponse("order_id and logist_id required");
          
          console.log("[cancelOrderByLogist] ========================================");
          console.log("[cancelOrderByLogist] Начало отмены заказа");
          console.log("[cancelOrderByLogist] order_id:", order_id, "тип:", typeof order_id);
          console.log("[cancelOrderByLogist] logist_id:", logist_id, "тип:", typeof logist_id);
          
          // Получаем заказ
          const { data: order, error: orderErr } = await supabase.from("orders").select("id, start_time, status, collected_amount, created_by, required_slots, wage_per_hour, duration_hours, executor_ids").eq("id", order_id).single();
          
          if (orderErr || !order) {
            console.error("[cancelOrderByLogist] ❌ Заказ не найден:", orderErr);
            return errorResponse("Order not found");
          }
          
          console.log("[cancelOrderByLogist] Заказ найден:", {
            id: order.id,
            status: order.status,
            created_by: order.created_by,
            created_by_type: typeof order.created_by
          });
          
          const logistTelegramId = Number(logist_id);
          const orderCreatedBy = Number(order.created_by);
          
          console.log("[cancelOrderByLogist] Проверка авторизации:", {
            logistTelegramId,
            orderCreatedBy,
            match: orderCreatedBy === logistTelegramId
          });
          
          if (orderCreatedBy !== logistTelegramId) {
            console.error("[cancelOrderByLogist] ❌ Не авторизован:", {
              orderCreatedBy,
              logistTelegramId
            });
            return errorResponse("Not authorized");
          }
          
          if (order.status === "cancelled" || order.status === "completed") {
            console.warn("[cancelOrderByLogist] ⚠️ Заказ уже закрыт:", order.status);
            return errorResponse("Order already closed");
          }
          
          // Рассчитываем время до начала заказа
          const startTime = new Date(order.start_time);
          const currentTime = now();
          const diffMs = startTime.getTime() - currentTime.getTime();
          const hoursUntilStart = diffMs / (1000 * 60 * 60);
          
          console.log("[cancelOrderByLogist] Время до начала заказа:", hoursUntilStart, "часов");
          
          // Получаем исполнителей в работе для правильного расчета штрафа
          const { data: workingResponders } = await supabase
            .from("order_responses")
            .select("user_id, status")
            .eq("order_id", order_id)
            .in("status", ["confirmed", "working", "in_progress"]);
          
          // Обновляем заказ с информацией о работающих исполнителях для расчета штрафа
          const orderWithWorkers = {
            ...order,
            executor_ids: workingResponders && workingResponders.length > 0 ? 
              workingResponders.map(r => r.user_id).join(',') : null
          };
          
          // Рассчитываем штраф
          const penalty = calculateCancellationPenalty(orderWithWorkers, hoursUntilStart);
          
          console.log("[cancelOrderByLogist] Расчёт штрафа:", penalty);
          
          // Получаем баланс логиста
          const { data: logist, error: logistErr } = await supabase
            .from("users")
            .select("balance")
            .eq("telegram_id", logistTelegramId)
            .single();
          
          if (logistErr || !logist) {
            console.error("[cancelOrderByLogist] ❌ Логист не найден:", logistErr);
            return errorResponse("Logist not found");
          }
          
          const currentBalance = Number(logist.balance || 0);
          
          // Проверяем, достаточно ли средств для штрафа
          if (penalty.penaltyAmount > 0 && currentBalance < penalty.penaltyAmount) {
            console.error("[cancelOrderByLogist] ❌ Недостаточно средств для штрафа:", {
              required: penalty.penaltyAmount,
              available: currentBalance
            });
            return errorResponse(`Недостаточно средств для оплаты штрафа. Требуется: ${penalty.penaltyAmount}₽, доступно: ${currentBalance}₽`);
          }
          // Применяем штраф, если он есть
          if (penalty.penaltyAmount > 0) {
            // Списываем штраф с баланса логиста
            const newLogistBalance = currentBalance - penalty.penaltyAmount;
            
            const { error: updateBalanceErr } = await supabase
              .from("users")
              .update({ balance: newLogistBalance.toString() })
              .eq("telegram_id", logistTelegramId);
            
            if (updateBalanceErr) {
              console.error("[cancelOrderByLogist] ❌ Ошибка списания штрафа:", updateBalanceErr);
              return errorResponse("Ошибка при списании штрафа");
            }
            
            // Создаём транзакцию штрафа
            await supabase.from("transactions").insert({
              user_id: logistTelegramId,
              order_id,
              type: "penalty",
              amount: -penalty.penaltyAmount,
              description: `Штраф за отмену заказа: ${penalty.reason}`,
              created_at: toISO(currentTime)
            });
            
            console.log(`[cancelOrderByLogist] ✅ Списан штраф ${penalty.penaltyAmount}₽ с логиста`);
          }
          
          // Находим исполнителей, которые уже подтвердили участие (status = "confirmed")
          const { data: confirmedResponders, error: confirmedRespondersErr } = await supabase
            .from("order_responses")
            .select("user_id, id")
            .eq("order_id", order_id)
            .eq("status", "confirmed");
          
          if (confirmedRespondersErr) {
            console.error("[cancelOrderByLogist] Ошибка получения подтвердивших исполнителей:", confirmedRespondersErr);
          }
          
          // Выплачиваем компенсацию исполнителям, если предусмотрена
          if (confirmedResponders && confirmedResponders.length > 0 && penalty.performerCompensation > 0) {
            const compensationPerPerformer = Math.round(penalty.performerCompensation / confirmedResponders.length * 100) / 100;
            
            for (const responder of confirmedResponders) {
              const telegramId = Number(responder.user_id);
              
              // Получаем баланс исполнителя
              const { data: performer } = await supabase
                .from("users")
                .select("balance")
                .eq("telegram_id", telegramId)
                .single();
              
              if (performer) {
                const currentPerformerBalance = Number(performer.balance || 0);
                const newPerformerBalance = currentPerformerBalance + compensationPerPerformer;
                
                // Обновляем баланс исполнителя
                await supabase.from("users").update({
                  balance: newPerformerBalance.toString()
                }).eq("telegram_id", telegramId);
                
                // Создаём транзакцию компенсации
                await supabase.from("transactions").insert({
                  user_id: telegramId,
                  order_id,
                  type: "compensation",
                  amount: compensationPerPerformer,
                  description: `Компенсация за отмену заказа логистом`,
                  created_at: toISO(currentTime)
                });
                
                console.log(`[cancelOrderByLogist] ✅ Выплачена компенсация ${compensationPerPerformer}₽ исполнителю ${telegramId}`);
              }
            }
          }
          // Возвращаем заказ в пул поиска (статус "active") или отменяем полностью
          let newStatus = "cancelled";
          let statusMessage = "Order cancelled";
          
          // Если штрафа нет (заказ не набрался), возвращаем в пул поиска
          if (penalty.penaltyAmount === 0) {
            newStatus = "new";
            statusMessage = "Order returned to search pool";
            
            // Очищаем executor_ids, чтобы заказ снова стал доступен
            const { error: clearExecutorsErr } = await supabase
              .from("orders")
              .update({ executor_ids: null })
              .eq("id", order_id);
            
            if (clearExecutorsErr) {
              console.error("[cancelOrderByLogist] ❌ Ошибка очистки executor_ids:", clearExecutorsErr);
            } else {
              console.log("[cancelOrderByLogist] ✅ Очищены executor_ids для возврата в пул");
            }
          }
          
          console.log(`[cancelOrderByLogist] Обновление статуса заказа на '${newStatus}'...`);
          const { data: updatedOrder, error: updateOrderErr } = await supabase.from("orders").update({
            status: newStatus
          }).eq("id", order_id).select().single();
          
          if (updateOrderErr) {
            console.error("[cancelOrderByLogist] ❌ Ошибка обновления статуса заказа:", updateOrderErr);
            return errorResponse(`Ошибка при отмене заказа: ${updateOrderErr.message}`);
          }
          
          if (!updatedOrder) {
            console.error("[cancelOrderByLogist] ❌ Заказ не обновлен (updatedOrder = null)");
            return errorResponse("Ошибка при отмене заказа: заказ не обновлен");
          }
          
          console.log(`[cancelOrderByLogist] ✅ Статус заказа успешно обновлен на '${newStatus}':`, {
            order_id: updatedOrder.id,
            status: updatedOrder.status
          });
          // Находим всех откликнувшихся (pending, accepted) для уведомления и возврата откликов
          const { data: allResponders } = await supabase.from("order_responses").select("user_id, status").eq("order_id", order_id).in("status", [
            "pending",
            "accepted",
            "confirmed"
          ]);
          // Удаляем все отклики на заказ
          const { error: deleteResponsesErr } = await supabase
            .from("order_responses")
            .delete()
            .eq("order_id", order_id);
          
          if (deleteResponsesErr) {
            console.error("[cancelOrderByLogist] ❌ Ошибка удаления откликов:", deleteResponsesErr);
          } else {
            console.log("[cancelOrderByLogist] ✅ Удалены все отклики на заказ");
          }
          
          // Возвращаем отклики и создаём уведомления для всех откликнувшихся
          if (allResponders && allResponders.length > 0) {
            for (const responder of allResponders){
              const responderTelegramId = Number(responder.user_id);
              
              // Возвращаем отклик (уменьшаем daily_applies_count)
              const { data: responderUser } = await supabase.from("users")
                .select("daily_applies_count")
                .eq("telegram_id", responderTelegramId)
                .single();
              
              if (responderUser) {
                const currentDailyCount = Number(responderUser.daily_applies_count || 0);
                const newDailyCount = Math.max(0, currentDailyCount - 1);
                await supabase.from("users").update({
                  daily_applies_count: newDailyCount
                }).eq("telegram_id", responderTelegramId);
                console.log(`[cancelOrderByLogist] ✅ Возвращен отклик пользователю ${responderTelegramId}, осталось: ${newDailyCount}`);
              }
              
              // Создаём уведомление
              await supabase.from("notifications").insert({
                user_id: responderTelegramId,
                payload: JSON.stringify({
                  type: "order_cancelled",
                  order_id
                }),
                read: false,
                created_at: toISO(new Date())
              });
            }
          }
          return successResponse({
            success: true,
            message: statusMessage,
            penalty: penalty.penaltyAmount > 0 ? {
              amount: penalty.penaltyAmount,
              reason: penalty.reason
            } : null
          });
        }
      // ========== 8) Финализация заказа (логист помечает заказ завершённым) ==========
      // Рассчитываем выплаты: total_amount распределяется между исполнителями (количество принятых исполнителей),
      // для каждого считаем комиссия платформы по их подписке, формируем payout_tasks с реквизитами из профиля
      case "finalizeOrder":
        {
          const { order_id, logist_id } = body;
          if (!order_id || !logist_id) return errorResponse("order_id and logist_id required");
          // Получаем заказ
          console.log("[finalizeOrder] Поиск заказа:", {
            order_id,
            order_id_type: typeof order_id,
            logist_id,
            logist_id_type: typeof logist_id
          });
          // Сначала пробуем найти заказ без .single() чтобы увидеть все результаты
          const { data: allOrders, error: allOrdersErr } = await supabase.from("orders").select("id, collected_amount, required_slots, wage_per_hour, duration_hours, status, created_by, customer_id").eq("id", order_id);
          console.log("[finalizeOrder] Результат поиска без .single():", {
            found: allOrders?.length || 0,
            error: allOrdersErr,
            orders: allOrders?.map((o)=>({
                id: o.id,
                status: o.status,
                created_by: o.created_by
              }))
          });
          // Теперь с .single()
          const { data: order, error: orderErr } = await supabase.from("orders").select("id, collected_amount, required_slots, wage_per_hour, duration_hours, status, created_by, executor_ids").eq("id", order_id).single();
          console.log("[finalizeOrder] Результат поиска с .single():", {
            found: !!order,
            error: orderErr,
            order_id: order_id,
            order: order ? {
              id: order.id,
              status: order.status,
              created_by: order.created_by
            } : null
          });
          if (orderErr || !order) {
            console.error("[finalizeOrder] ❌ Заказ не найден:", {
              order_id,
              error: orderErr,
              error_message: orderErr?.message,
              error_code: orderErr?.code,
              error_details: orderErr?.details
            });
            return errorResponse(`Order not found: ${orderErr?.message || 'Unknown error'}`);
          }
          const logistTelegramIdFinalize = Number(logist_id);
          if (Number(order.created_by) !== logistTelegramIdFinalize) return errorResponse("Not authorized");
          // Разрешаем завершать заказы со статусом "new", "in_progress" или "matched"
          const allowedStatuses = [
            "new",
            "in_progress",
            "matched"
          ];
          if (!allowedStatuses.includes(order.status)) {
            return errorResponse(`Order status "${order.status}" cannot be finalized. Allowed: ${allowedStatuses.join(", ")}`);
          }
          // Проверяем, какие статусы разрешены в БД (обычно: new, in_progress, matched, cancelled, completed)
          // Используем "completed" вместо "finished", так как "finished" может не быть в CHECK constraint
          // Получаем список исполнителей из executor_ids заказа (через запятую)
          // executor_ids хранит telegram_id ПОДТВЕРДИВШИХ исполнителей через запятую
          let executorIdsString = (order.executor_ids || "").toString().trim();
          console.log("[finalizeOrder] ========================================");
          console.log("[finalizeOrder] НАЧАЛО ПОИСКА УЧАСТНИКОВ");
          console.log("[finalizeOrder] Заказ ID:", order_id);
          console.log("[finalizeOrder] executor_ids из заказа (сырое значение):", order.executor_ids);
          console.log("[finalizeOrder] executor_ids (обработанное):", executorIdsString);
          console.log("[finalizeOrder] Тип executor_ids:", typeof order.executor_ids);
          // Если executor_ids пустой, пытаемся найти подтвердивших исполнителей из order_responses
          if (!executorIdsString || executorIdsString === "" || executorIdsString === "null") {
            console.warn("[finalizeOrder] ⚠️ executor_ids пустой, ищем подтвердивших в order_responses...");
            // Ищем ВСЕ отклики на этот заказ, чтобы увидеть все статусы
            const { data: allResponses, error: allRespErr } = await supabase.from("order_responses").select("id, user_id, status, deposit_amount").eq("order_id", order_id);
            console.log("[finalizeOrder] Все отклики на заказ:", {
              count: allResponses?.length || 0,
              responses: allResponses?.map((r)=>({
                  user_id: r.user_id,
                  status: r.status
                })),
              error: allRespErr?.message
            });
            // Теперь ищем только подтвердивших
            const { data: confirmedResponses, error: confirmedErr } = await supabase.from("order_responses").select("id, user_id, status, deposit_amount").eq("order_id", order_id).eq("status", "confirmed");
            console.log("[finalizeOrder] Подтвердившие (status='confirmed'):", {
              count: confirmedResponses?.length || 0,
              responses: confirmedResponses?.map((r)=>({
                  user_id: r.user_id,
                  status: r.status
                })),
              error: confirmedErr?.message
            });
            // Также ищем accepted, на случай если статус не обновился
            const { data: acceptedResponses, error: acceptedErr } = await supabase.from("order_responses").select("id, user_id, status, deposit_amount").eq("order_id", order_id).eq("status", "accepted");
            console.log("[finalizeOrder] Принятые (status='accepted'):", {
              count: acceptedResponses?.length || 0,
              responses: acceptedResponses?.map((r)=>({
                  user_id: r.user_id,
                  status: r.status
                })),
              error: acceptedErr?.message
            });
            if (confirmedErr) {
              console.error("[finalizeOrder] Ошибка поиска подтвердивших:", confirmedErr);
            } else if (confirmedResponses && confirmedResponses.length > 0) {
              const executorIds = confirmedResponses.map((r)=>Number(r.user_id)).filter((id)=>!isNaN(id) && id > 0);
              executorIdsString = executorIds.join(",");
              console.log("[finalizeOrder] ✅ Найдено подтвердивших исполнителей из order_responses:", executorIdsString);
              // Сохраняем найденный список в executor_ids для будущего использования
              const { error: saveErr } = await supabase.from("orders").update({
                executor_ids: executorIdsString
              }).eq("id", order_id);
              if (saveErr) {
                console.error("[finalizeOrder] Ошибка сохранения executor_ids:", saveErr);
              } else {
                console.log("[finalizeOrder] ✅ executor_ids сохранен в заказ");
              }
            } else if (acceptedResponses && acceptedResponses.length > 0) {
              // Если есть accepted, но нет confirmed, используем accepted
              console.warn("[finalizeOrder] ⚠️ Нет confirmed, но есть accepted - используем их");
              const executorIds = acceptedResponses.map((r)=>Number(r.user_id)).filter((id)=>!isNaN(id) && id > 0);
              executorIdsString = executorIds.join(",");
              console.log("[finalizeOrder] ✅ Найдено принятых исполнителей (accepted):", executorIdsString);
            } else {
              console.warn("[finalizeOrder] ⚠️ Нет подтвердивших исполнителей в order_responses!");
            }
          } else {
            console.log("[finalizeOrder] ✅ Найден список исполнителей в executor_ids:", executorIdsString);
          }
          console.log("[finalizeOrder] Итоговая строка с ID исполнителей:", executorIdsString);
          let participantTelegramIds = [];
          if (executorIdsString && executorIdsString.trim() !== "" && executorIdsString !== "null") {
            // Парсим строку через запятую
            participantTelegramIds = executorIdsString.split(",").map((id)=>id.trim()).filter((id)=>id && id !== "" && !isNaN(Number(id))).map((id)=>Number(id));
          }
          console.log("[finalizeOrder] ID исполнителей для выплаты (после парсинга):", participantTelegramIds);
          console.log("[finalizeOrder] Количество ID:", participantTelegramIds.length);
          if (participantTelegramIds.length === 0) {
            console.error("[finalizeOrder] ❌❌❌ НЕТ ИСПОЛНИТЕЛЕЙ ДЛЯ ВЫПЛАТЫ!");
            console.error("[finalizeOrder] executor_ids значение:", order.executor_ids);
            console.error("[finalizeOrder] executorIdsString:", executorIdsString);
            console.error("[finalizeOrder] Заказ будет завершен БЕЗ выплат");
          }
          // Получаем информацию о каждом исполнителе и их депозитах из order_responses
          // ВАЖНО: выплачиваем ТОЛЬКО тем, кто подтвердил участие (status = "confirmed")
          const participants = [];
          console.log("[finalizeOrder] ========================================");
          console.log("[finalizeOrder] ПОИСК УЧАСТНИКОВ ДЛЯ ВЫПЛАТЫ");
          console.log("[finalizeOrder] Список ID для поиска:", participantTelegramIds);
          console.log("[finalizeOrder] Количество ID:", participantTelegramIds.length);
          // Если список пустой, но executor_ids был записан, попробуем найти ВСЕ отклики на заказ
          if (participantTelegramIds.length === 0) {
            console.warn("[finalizeOrder] ⚠️ Список ID пустой, ищем ВСЕ отклики на заказ...");
            const { data: allOrderResponses, error: allOrderErr } = await supabase.from("order_responses").select("id, user_id, deposit_amount, status").eq("order_id", order_id);
            console.log("[finalizeOrder] Все отклики на заказ:", {
              count: allOrderResponses?.length || 0,
              responses: allOrderResponses?.map((r)=>({
                  user_id: r.user_id,
                  status: r.status,
                  deposit: r.deposit_amount
                }))
            });
            // Если есть отклики со статусом "confirmed" или "accepted", используем их
            if (allOrderResponses && allOrderResponses.length > 0) {
              // Сначала ищем confirmed
              let validResponses = allOrderResponses.filter((r)=>r.status === "confirmed");
              // Если нет confirmed, ищем accepted
              if (validResponses.length === 0) {
                validResponses = allOrderResponses.filter((r)=>r.status === "accepted");
                console.warn("[finalizeOrder] ⚠️ Нет confirmed, используем accepted");
              }
              // Если все еще нет, используем ЛЮБЫЕ отклики (на случай, если статус не обновился)
              if (validResponses.length === 0) {
                validResponses = allOrderResponses;
                console.warn("[finalizeOrder] ⚠️ Нет confirmed/accepted, используем ВСЕ отклики на заказ");
              }
              if (validResponses.length > 0) {
                console.log("[finalizeOrder] ✅ Найдены валидные отклики, используем их:", validResponses.length);
                participantTelegramIds = validResponses.map((r)=>Number(r.user_id));
                // Сохраняем найденные ID в executor_ids для будущего использования
                const foundIdsString = participantTelegramIds.join(",");
                await supabase.from("orders").update({
                  executor_ids: foundIdsString
                }).eq("id", order_id);
                console.log("[finalizeOrder] ✅ Сохранены найденные ID в executor_ids:", foundIdsString);
              }
            }
          }
          for (const telegramId of participantTelegramIds){
            console.log(`[finalizeOrder] ----------------------------------------`);
            console.log(`[finalizeOrder] Поиск отклика для исполнителя ${telegramId}...`);
            // Находим отклик этого исполнителя на этот заказ
            // Сначала ищем БЕЗ фильтра по статусу, чтобы увидеть реальный статус
            console.log(`[finalizeOrder] Поиск отклика: order_id=${order_id}, user_id=${telegramId}, тип user_id=${typeof telegramId}`);
            // Пробуем найти отклик - сначала с .single()
            let anyResponse = null;
            let anyRespErr = null;
            const { data: singleResponse, error: singleErr } = await supabase.from("order_responses").select("id, user_id, deposit_amount, status").eq("order_id", order_id).eq("user_id", telegramId).single();
            if (!singleErr && singleResponse) {
              anyResponse = singleResponse;
              console.log(`[finalizeOrder] ✅ Отклик найден через .single()`);
            } else {
              console.warn(`[finalizeOrder] ⚠️ Не найден через .single(), пробуем без .single()`);
              console.warn(`[finalizeOrder] Ошибка:`, singleErr?.message);
              // Пробуем без .single() - может быть несколько откликов
              const { data: multipleResponses, error: multipleErr } = await supabase.from("order_responses").select("id, user_id, deposit_amount, status").eq("order_id", order_id).eq("user_id", telegramId);
              if (!multipleErr && multipleResponses && multipleResponses.length > 0) {
                anyResponse = multipleResponses[0]; // Берем первый
                console.log(`[finalizeOrder] ✅ Найдено ${multipleResponses.length} откликов, берем первый`);
              } else {
                anyRespErr = multipleErr || singleErr;
                console.error(`[finalizeOrder] ❌ Отклик не найден вообще`);
              }
            }
            console.log(`[finalizeOrder] Отклик для исполнителя ${telegramId}:`, {
              found: !!anyResponse,
              status: anyResponse?.status,
              user_id: anyResponse?.user_id,
              user_id_type: typeof anyResponse?.user_id,
              user_id_value: anyResponse?.user_id,
              searched_telegram_id: telegramId,
              searched_telegram_id_type: typeof telegramId,
              deposit_amount: anyResponse?.deposit_amount,
              error: anyRespErr?.message,
              error_code: anyRespErr?.code
            });
            // Принимаем ЛЮБОЙ статус отклика - если отклик есть, значит исполнитель участвовал
            if (anyResponse) {
              const deposit = Number(anyResponse.deposit_amount || 0);
              const currentStatus = anyResponse.status;
              // Обновляем статус на "confirmed" если он не такой
              if (currentStatus !== "confirmed") {
                console.warn(`[finalizeOrder] ⚠️ Статус отклика "${currentStatus}" вместо "confirmed" для ${telegramId}, обновляем статус`);
                // Обновляем статус на "confirmed"
                const { error: updateStatusErr } = await supabase.from("order_responses").update({
                  status: "confirmed"
                }).eq("id", anyResponse.id);
                if (updateStatusErr) {
                  console.error(`[finalizeOrder] Ошибка обновления статуса:`, updateStatusErr);
                } else {
                  console.log(`[finalizeOrder] ✅ Статус обновлен на "confirmed"`);
                }
              }
              participants.push({
                user_id: telegramId,
                deposit_amount: deposit,
                status: "confirmed"
              });
              console.log(`[finalizeOrder] ✅ Исполнитель ${telegramId} найден, будет выплата. Депозит: ${deposit}₽, был статус: ${currentStatus}`);
            } else {
              console.error(`[finalizeOrder] ❌ Исполнитель ${telegramId} НЕ найден в order_responses`);
              console.error(`[finalizeOrder] Детали:`, {
                response: anyResponse || null,
                error: anyRespErr,
                error_message: anyRespErr?.message,
                error_code: anyRespErr?.code,
                searched_telegram_id: telegramId,
                searched_order_id: order_id
              });
              // Пробуем найти ВСЕ отклики на этот заказ для отладки
              const { data: allOrderResponses } = await supabase.from("order_responses").select("id, user_id, deposit_amount, status").eq("order_id", order_id);
              console.error(`[finalizeOrder] Все отклики на этот заказ:`, allOrderResponses);
            }
          }
          console.log("[finalizeOrder] ========================================");
          console.log("[finalizeOrder] ИТОГО найдено участников для выплаты:", participants.length);
          console.log("[finalizeOrder] Участники:", participants.map((p)=>({
              user_id: p.user_id,
              deposit: p.deposit_amount,
              status: p.status
            })));
          // Если нет участников — ищем ВСЕ отклики на заказ и используем их
          if (participants.length === 0) {
            console.error("[finalizeOrder] ❌❌❌ НЕТ УЧАСТНИКОВ ДЛЯ ВЫПЛАТЫ!");
            console.error("[finalizeOrder] Пытаемся найти участников из всех откликов...");
            // Ищем ВСЕ отклики на заказ
            const { data: allResponsesForPayout, error: allRespErrForPayout } = await supabase.from("order_responses").select("id, user_id, deposit_amount, status").eq("order_id", order_id);
            console.log("[finalizeOrder] Все отклики для выплаты:", {
              count: allResponsesForPayout?.length || 0,
              responses: allResponsesForPayout
            });
            if (allResponsesForPayout && allResponsesForPayout.length > 0) {
              // Используем ВСЕ отклики, независимо от статуса
              for (const resp of allResponsesForPayout){
                const telegramId = Number(resp.user_id);
                const deposit = Number(resp.deposit_amount || 0);
                participants.push({
                  user_id: telegramId,
                  deposit_amount: deposit,
                  status: "confirmed" // Принудительно ставим confirmed для выплаты
                });
                // Обновляем статус на confirmed
                await supabase.from("order_responses").update({
                  status: "confirmed"
                }).eq("id", resp.id);
                console.log(`[finalizeOrder] ✅ Добавлен участник ${telegramId} из всех откликов. Депозит: ${deposit}₽`);
              }
              console.log("[finalizeOrder] ✅ Найдено участников из всех откликов:", participants.length);
            }
            // Если все еще нет участников - завершаем без выплат
            if (participants.length === 0) {
              console.error("[finalizeOrder] ❌❌❌ ВСЕ ЕЩЕ НЕТ УЧАСТНИКОВ!");
              console.error("[finalizeOrder] Заказ будет завершен БЕЗ выплат");
              console.error("[finalizeOrder] Проверьте:");
              console.error("  1. Записан ли executor_ids в заказе");
              console.error("  2. Есть ли отклики на этот заказ в order_responses");
              console.error("  3. Совпадают ли ID в executor_ids с user_id в order_responses");
              await supabase.from("orders").update({
                status: "completed"
              }).eq("id", order_id);
              // Обновляем статусы откликов
              await supabase.from("order_responses").update({
                status: "completed"
              }).eq("order_id", order_id);
              return successResponse({
                success: true,
                message: "Order finished with no participants",
                warning: "No participants found for payout. Check executor_ids and order_responses status."
              });
            }
          }
          // Определяем выплату каждому
          // Рассчитываем общую сумму: wage_per_hour * duration_hours * количество участников
          const wagePerHour = Number(order.wage_per_hour || 0);
          const durationHours = Number(order.duration_hours || 0);
          const participantCount = participants.length || 1;
          // Общая сумма = зарплата в час * количество часов * количество участников
          let totalAmount = wagePerHour * durationHours * participantCount;
          // Если есть collected_amount и он больше 0, используем его
          const collectedAmount = Number(order.collected_amount || 0);
          if (collectedAmount > 0) {
            totalAmount = collectedAmount;
            console.log("[finalizeOrder] Используем collected_amount:", totalAmount);
          } else {
            console.log("[finalizeOrder] Рассчитываем из параметров:", {
              wagePerHour,
              durationHours,
              participantCount,
              calculatedTotal: totalAmount
            });
          }
          console.log("[finalizeOrder] Общая сумма заказа:", totalAmount, "Участников:", participants.length);
          console.log("[finalizeOrder] Параметры заказа:", {
            collected_amount: order.collected_amount,
            wage_per_hour: order.wage_per_hour,
            duration_hours: order.duration_hours,
            required_slots: order.required_slots
          });
          if (participants.length === 0) {
            console.error("[finalizeOrder] ❌ КРИТИЧЕСКАЯ ОШИБКА: НЕТ УЧАСТНИКОВ ДЛЯ ВЫПЛАТЫ!");
            console.error("[finalizeOrder] Это не должно произойти, так как мы уже проверили выше");
            console.error("[finalizeOrder] participantTelegramIds:", participantTelegramIds);
            console.error("[finalizeOrder] executorIdsString:", executorIdsString);
          // Не возвращаем ошибку, продолжаем выполнение - возможно участники были найдены выше
          // return errorResponse("No confirmed participants found for payout");
          }
          if (participants.length === 0) {
            console.error("[finalizeOrder] ❌❌❌ КРИТИЧЕСКАЯ ОШИБКА: НЕТ УЧАСТНИКОВ!");
            console.error("[finalizeOrder] Невозможно произвести выплату без участников");
            // Завершаем заказ без выплат
            await supabase.from("orders").update({
              status: "completed"
            }).eq("id", order_id);
            await supabase.from("order_responses").update({
              status: "completed"
            }).eq("order_id", order_id);
            return successResponse({
              success: true,
              message: "Order finished with no participants",
              warning: "No participants found for payout"
            });
          }
          const perPersonGross = Math.round(totalAmount / participants.length * 100) / 100;
          console.log("[finalizeOrder] ========================================");
          console.log("[finalizeOrder] РАСЧЕТ ВЫПЛАТЫ");
          console.log("[finalizeOrder] Общая сумма заказа:", totalAmount, "₽");
          console.log("[finalizeOrder] Количество участников:", participants.length);
          console.log("[finalizeOrder] Выплата на человека (gross):", perPersonGross, "₽");
          console.log("[finalizeOrder] ========================================");
          if (perPersonGross === 0) {
            console.error("[finalizeOrder] ❌ Сумма выплаты = 0! totalAmount:", totalAmount, "participants:", participants.length);
            console.error("[finalizeOrder] Проверьте wage_per_hour и duration_hours заказа");
          }
          const payoutTasks = [];
          console.log("[finalizeOrder] ========================================");
          console.log("[finalizeOrder] НАЧИНАЕМ ВЫПЛАТУ ДЛЯ", participants.length, "УЧАСТНИКОВ");
          console.log("[finalizeOrder] Общая сумма:", totalAmount, "₽");
          console.log("[finalizeOrder] На человека (gross):", perPersonGross, "₽");
          console.log("[finalizeOrder] Список участников:", participants.map((p)=>({
              user_id: p.user_id,
              deposit: p.deposit_amount,
              status: p.status
            })));
          console.log("[finalizeOrder] ========================================");
          if (participants.length === 0) {
            console.error("[finalizeOrder] ❌❌❌ КРИТИЧЕСКАЯ ОШИБКА: ЦИКЛ ВЫПЛАТЫ НЕ БУДЕТ ВЫПОЛНЕН!");
            console.error("[finalizeOrder] participants.length = 0, невозможно произвести выплату");
            // Завершаем заказ без выплат
            await supabase.from("orders").update({
              status: "completed"
            }).eq("id", order_id);
            await supabase.from("order_responses").update({
              status: "completed"
            }).eq("order_id", order_id);
            return successResponse({
              success: true,
              message: "Order finished with no participants",
              warning: "No participants found for payout"
            });
          }
          // ИЗМЕНЕНИЕ: С логистов НИЧЕГО не берем при завершении заказа
          // Логист не платит за заказ, деньги платят только исполнители (комиссия)
          // Логист и исполнители сами между собой договариваются о выплате
          const logistTelegramId = Number(order.created_by);
          console.log(`[finalizeOrder] Заказ завершен. Логист ${logistTelegramId} ничего не платит.`);
          console.log("[finalizeOrder] ✅ Участники найдены, начинаем создание payout_tasks...");
          for (const p of participants){
            console.log("[finalizeOrder] ----------------------------------------");
            console.log("[finalizeOrder] Обработка участника:", {
              user_id: p.user_id,
              status: p.status
            });
            // получим профиль исполнителя и его подписку
            const performerTelegramId = Number(p.user_id);
            console.log(`[finalizeOrder] Поиск исполнителя с telegram_id: ${performerTelegramId}`);
            const { data: performer, error: perfErr } = await supabase.from("users").select("id, username, subscription_tier, active_jobs_count").eq("telegram_id", performerTelegramId).single();
            if (perfErr || !performer) {
              console.error(`[finalizeOrder] ❌ Исполнитель не найден для выплаты:`, {
                telegram_id: performerTelegramId,
                error: perfErr,
                participant: p
              });
              continue;
            }
            console.log(`[finalizeOrder] ✅ Исполнитель найден:`, {
              id: performer.id,
              username: performer.username,
              telegram_id: performerTelegramId
            });
            const performerTier = getPerformerTier(performer.subscription_tier);
            const commission = Math.round(performerTier.commission_pct / 100 * perPersonGross * 100) / 100;
            const net = Math.round((perPersonGross - commission) * 100) / 100;
            // Create payout_task (manual/automated payment system will process)
            const task = {
              user_id: p.user_id,
              order_id,
              gross_amount: perPersonGross,
              commission,
              net_amount: net,
              status: "pending",
              created_at: toISO(new Date())
            };
            payoutTasks.push({
              ...task,
              performer_name: performer.username || "Неизвестно",
              performer_telegram_id: performerTelegramId
            });
            // ИЗМЕНЕНИЕ: НЕ начисляем деньги на баланс исполнителя
            // Исполнитель получает деньги напрямую от логиста
            // Мы только создаем payout_task для учета
            // Выплаты за выполнение заказа не выводим в истории операций
            // Депозитов больше нет
            console.log(`[finalizeOrder] Создание payout_task для исполнителя ${performerTelegramId}:`, {
              performer_id: performer.id,
              gross: perPersonGross,
              commission,
              net
            });
            // Уменьшаем счетчик активных заказов
            const currentActiveJobs = Number(performer.active_jobs_count || 0);
            const newActiveJobs = Math.max(0, currentActiveJobs - 1);
            // Обновляем только счетчик активных заказов
            const { error: updateActiveJobsErr } = await supabase.from("users").update({
              active_jobs_count: newActiveJobs
            }).eq("telegram_id", performerTelegramId);
            if (updateActiveJobsErr) {
              console.error(`[finalizeOrder] ❌ Ошибка обновления счетчика активных заказов:`, updateActiveJobsErr);
            } else {
              console.log(`[finalizeOrder] ✅ Счетчик активных заказов обновлен: ${currentActiveJobs} → ${newActiveJobs}`);
            }
            // ИЗМЕНЕНИЕ: НЕ создаем транзакции income
            // Выплаты за выполнение заказа не выводим в истории операций
            // Исполнитель получает деньги напрямую от логиста
            // Депозитов больше нет
            console.log(`[finalizeOrder] ----------------------------------------`);
            console.log(`[finalizeOrder] ✅✅✅ ЗАВЕРШЕНА ОБРАБОТКА УЧАСТНИКА ${performerTelegramId}`);
            console.log(`[finalizeOrder] Итоги:`);
            console.log(`[finalizeOrder]   - Создан payout_task: ${net}₽ (после комиссии ${commission}₽)`);
            console.log(`[finalizeOrder]   - Исполнитель получает деньги напрямую от логиста`);
            console.log(`[finalizeOrder]   - Баланс НЕ изменяется`);
            console.log(`[finalizeOrder]   - Выплаты за выполнение заказа не выводятся в истории операций`);
          }
          console.log("[finalizeOrder] ========================================");
          console.log("[finalizeOrder] ✅✅✅ ВЫПЛАТА ЗАВЕРШЕНА ДЛЯ ВСЕХ УЧАСТНИКОВ");
          console.log("[finalizeOrder] Обработано участников:", participants.length);
          console.log("[finalizeOrder] ========================================");
          // Insert payout tasks
          if (payoutTasks.length) {
            const { error: insErr } = await supabase.from("payout_tasks").insert(payoutTasks);
            if (insErr) {
              console.error("[finalizeOrder] Ошибка вставки payout_tasks:", insErr);
            // Не прерываем выполнение, но логируем ошибку
            } else {
              console.log("[finalizeOrder] Создано payout_tasks:", payoutTasks.length);
            }
          }
          // Обновляем статус заказа на completed
          const { error: updateErr } = await supabase.from("orders").update({
            status: "completed"
          }).eq("id", order_id);
          if (updateErr) {
            console.error("[finalizeOrder] Ошибка обновления статуса заказа:", updateErr);
            throw new Error(`Failed to update order status: ${updateErr.message}`);
          }
          console.log("[finalizeOrder] ✅ Статус заказа обновлен на 'completed'");
          // ОБНОВЛЯЕМ СТАТУС ВСЕХ ОТКЛИКОВ НА "completed" для исполнителей
          console.log("[finalizeOrder] Обновление статусов откликов на 'completed'...");
          const { error: updateResponsesErr } = await supabase.from("order_responses").update({
            status: "completed"
          }).eq("order_id", order_id).in("status", [
            "confirmed",
            "accepted",
            "pending"
          ]);
          if (updateResponsesErr) {
            console.error("[finalizeOrder] Ошибка обновления статусов откликов:", updateResponsesErr);
          } else {
            console.log("[finalizeOrder] ✅ Статусы всех откликов обновлены на 'completed'");
          }
          // ИЗМЕНЕНИЕ: Создаем записи о необходимости оценки после завершения заказа
          // Для логиста - нужно оценить каждого исполнителя
          // Для каждого исполнителя - нужно подтвердить получение оплаты
          console.log("[finalizeOrder] Создание уведомлений о необходимости оценки. Участников:", participants.length);
          console.log("[finalizeOrder] logistTelegramIdFinalize:", logistTelegramIdFinalize);
          // Создаем уведомления для логиста о необходимости оценки каждого исполнителя
          for (const participant of participants){
            const performerTelegramId = Number(participant.user_id);
            console.log("[finalizeOrder] Создание уведомлений для участника:", performerTelegramId);
            // Уведомление для логиста о необходимости оценки исполнителя
            const { data: logistNotif, error: logistNotifErr } = await supabase.from("notifications").insert({
              user_id: logistTelegramIdFinalize,
              payload: JSON.stringify({
                type: "pending_rating_logist",
                order_id: order_id,
                performer_id: performerTelegramId,
                role: "logist"
              }),
              read: false,
              created_at: toISO(new Date())
            }).select();
            if (logistNotifErr) {
              console.error("[finalizeOrder] Ошибка создания уведомления для логиста:", logistNotifErr);
            } else {
              console.log("[finalizeOrder] ✅ Уведомление pending_rating_logist создано для логиста:", logistTelegramIdFinalize, "исполнитель:", performerTelegramId);
            }
            // Уведомление для исполнителя о необходимости подтверждения получения оплаты
            const { data: performerNotif, error: performerNotifErr } = await supabase.from("notifications").insert({
              user_id: performerTelegramId,
              payload: JSON.stringify({
                type: "pending_rating_performer",
                order_id: order_id,
                logist_id: logistTelegramIdFinalize,
                role: "performer"
              }),
              read: false,
              created_at: toISO(new Date())
            }).select();
            if (performerNotifErr) {
              console.error("[finalizeOrder] Ошибка создания уведомления для исполнителя:", performerNotifErr);
            } else {
              console.log("[finalizeOrder] ✅ Уведомление pending_rating_performer создано для исполнителя:", performerTelegramId);
            }
          }
          console.log("[finalizeOrder] Все уведомления о необходимости оценки созданы");
          // Уведомление логисту и исполнителям о завершении заказа
          // Отправляем уведомление логисту
          await supabase.from("notifications").insert({
            user_id: logistTelegramIdFinalize,
            payload: JSON.stringify({
              type: "order_finished",
              order_id
            }),
            read: false,
            created_at: toISO(new Date())
          });
          // Отправляем уведомления всем исполнителям
          for (const participant of participants){
            const performerTelegramId = Number(participant.user_id);
            await supabase.from("notifications").insert({
              user_id: performerTelegramId,
              payload: JSON.stringify({
                type: "order_finished",
                order_id
              }),
              read: false,
              created_at: toISO(new Date())
            });
          }
          // ИЗМЕНЕНИЕ: Возвращаем данные для модалки завершения заказа
          // Получаем информацию о реквизитах исполнителей
          const participantsWithDetails = await Promise.all(
            participants.map(async (p) => {
              const performerTelegramId = Number(p.user_id);
              const { data: user } = await supabase
                .from("users")
                .select("telegram_id, username, phone_number, card_number, bank_name, rating")
                .eq("telegram_id", performerTelegramId)
                .single();
              
              return {
                telegram_id: performerTelegramId,
                name: user?.username || `User ${performerTelegramId}`,
                phone_number: user?.phone_number || null,
                card_number: user?.card_number || null,
                bank_name: user?.bank_name || null,
                rating: Number(user?.rating || 50),
                payment_amount: perPersonGross
              };
            })
          );

          return successResponse({
            success: true,
            order_id: order_id,
            total_amount: totalAmount,
            participants: participantsWithDetails,
            message: "Order ready for finalization"
          });
        }
      // ========== 8a) Сохранение оценок исполнителей ==========
      case "savePerformerRatings":
        {
          const { order_id, logist_id, ratings } = body;
          
          if (!order_id || !logist_id || !ratings || !Array.isArray(ratings)) {
            return errorResponse("order_id, logist_id and ratings array required");
          }
          
          const logistTelegramId = Number(logist_id);
          
          // Проверяем, что заказ принадлежит логисту
          const { data: order, error: orderErr } = await supabase
            .from("orders")
            .select("created_by")
            .eq("id", order_id)
            .single();
          
          if (orderErr || !order) {
            return errorResponse("Order not found");
          }
          
          if (Number(order.created_by) !== logistTelegramId) {
            return errorResponse("Not authorized");
          }
          
          // Сохраняем оценки для каждого исполнителя
          for (const rating of ratings) {
            const { performer_id, result, punctuality, communication } = rating;
            
            if (!performer_id || !result || !punctuality || !communication) {
              console.error("[savePerformerRatings] Пропущена оценка с неполными данными:", rating);
              continue;
            }
            
            await saveRatingCharacteristics(
              supabase,
              order_id,
              Number(performer_id),
              logistTelegramId,
              result,
              punctuality,
              communication
            );
          }
          
          return successResponse({
            success: true,
            message: "Ratings saved successfully"
          });
        }
      // ========== 8b) Завершение заказа после оценки ==========
      case "completeOrderAfterRating":
        {
          const { order_id, logist_id } = body;
          
          if (!order_id || !logist_id) {
            return errorResponse("order_id and logist_id required");
          }
          
          const logistTelegramId = Number(logist_id);
          
          // Проверяем, что заказ принадлежит логисту
          const { data: order, error: orderErr } = await supabase
            .from("orders")
            .select("created_by, executor_ids, status")
            .eq("id", order_id)
            .single();
          
          if (orderErr || !order) {
            return errorResponse("Order not found");
          }
          
          if (Number(order.created_by) !== logistTelegramId) {
            return errorResponse("Not authorized");
          }
          
          // Проверяем, что все исполнители оценены
          const executorIds = (order.executor_ids || "").split(",").filter(Boolean).map(id => Number(id.trim()));
          
          if (executorIds.length === 0) {
            return errorResponse("No performers found in order");
          }
          
          // Проверяем наличие оценок для всех исполнителей
          const { data: ratings, error: ratingsErr } = await supabase
            .from("ratings")
            .select("rated_id")
            .eq("order_id", order_id)
            .eq("rater_id", logistTelegramId)
            .eq("rater_role", "logist");
          
          if (ratingsErr) {
            console.error("[completeOrderAfterRating] Ошибка проверки оценок:", ratingsErr);
            return errorResponse("Error checking ratings");
          }
          
          const ratedIds = (ratings || []).map(r => Number(r.rated_id));
          const allRated = executorIds.every(id => ratedIds.includes(id));
          
          if (!allRated) {
            const missingIds = executorIds.filter(id => !ratedIds.includes(id));
            console.error("[completeOrderAfterRating] Не все исполнители оценены. Отсутствуют оценки для:", missingIds);
            return errorResponse(`Not all performers have been rated. Missing ratings for: ${missingIds.join(", ")}`);
          }
          
          // Обновляем статус заказа на "completed"
          const { error: updateErr } = await supabase
            .from("orders")
            .update({ status: "completed" })
            .eq("id", order_id);
          
          if (updateErr) {
            console.error("[completeOrderAfterRating] Ошибка обновления статуса заказа:", updateErr);
            return errorResponse("Error updating order status");
          }
          
          // Обновляем статусы откликов
          await supabase
            .from("order_responses")
            .update({ status: "completed" })
            .eq("order_id", order_id)
            .in("status", ["confirmed", "accepted", "pending"]);
          
          // Уменьшаем счетчики активных заказов у исполнителей
          for (const executorId of executorIds) {
            const { data: performer } = await supabase
              .from("users")
              .select("active_jobs_count")
              .eq("telegram_id", executorId)
              .single();
            
            if (performer) {
              const currentActiveJobs = Number(performer.active_jobs_count || 0);
              const newActiveJobs = Math.max(0, currentActiveJobs - 1);
              await supabase
                .from("users")
                .update({ active_jobs_count: newActiveJobs })
                .eq("telegram_id", executorId);
            }
          }
          
          // Создаем уведомления о завершении заказа
          await supabase.from("notifications").insert({
            user_id: logistTelegramId,
            payload: JSON.stringify({
              type: "order_finished",
              order_id
            }),
            read: false,
            created_at: toISO(new Date())
          });
          
          for (const executorId of executorIds) {
            await supabase.from("notifications").insert({
              user_id: executorId,
              payload: JSON.stringify({
                type: "order_finished",
                order_id
              }),
              read: false,
              created_at: toISO(new Date())
            });
          }
          
          return successResponse({
            success: true,
            message: "Order completed successfully"
          });
        }
      // ========== 9) Информация о тарифах / плашках ==========
      case "getSubscriptionsInfo":
        {
          return successResponse({
            success: true,
            performer_tiers: PERFORMER_TIERS,
            logist_tiers: LOGIST_TIERS,
            cancellation_rules: CANCELLATION_RULES
          });
        }
      // ========== Получение тарифов из таблицы ==========
      case "getSubscriptions":
        {
          try {
            const requestedRoleRaw = typeof body.role === "string" ? body.role.trim().toLowerCase() : "performer";
            let normalizedRole = requestedRoleRaw;
            if (["performer", "executor"].includes(requestedRoleRaw)) normalizedRole = "executor";
            if (["logist", "logistic"].includes(requestedRoleRaw)) normalizedRole = "logistic";
            if (!["executor", "logistic"].includes(normalizedRole)) normalizedRole = "executor";

            console.log("[getSubscriptions] Загрузка тарифов из БД:", {
              requested_role: requestedRoleRaw,
              normalized_role: normalizedRole
            });

            // Получаем подписки, пробуем получить features если есть
            // Используем select("*") чтобы получить все поля, включая features если оно есть
            const { data: subscriptions, error: subsError } = await supabase
              .from("subscriptions")
              .select("*")
              .eq("role", normalizedRole)
              .order("price", { ascending: true });

            if (subsError) {
              console.error("[getSubscriptions] Ошибка получения тарифов:", subsError);
              return errorResponse("Ошибка получения тарифов");
            }

            const tierDictionary = normalizedRole === "executor" ? PERFORMER_TIERS : LOGIST_TIERS;

            const resolveTierKey = (sub: any) => {
              const name = (sub.name || "").toLowerCase();
              if (normalizedRole === "executor") {
                if (name.includes("gold")) return "gold";
                if (name.includes("silver")) return "silver";
                return "free_performer";
              }
              if (name.includes("business")) return "logist_business";
              if (name.includes("light")) return "logist_light";
              return "logist_start";
            };

            const formattedSubscriptions = (subscriptions || []).map((sub)=>{
              const tierKey = resolveTierKey(sub);
              const tierInfo = tierDictionary[tierKey as keyof typeof tierDictionary];
              const features: string[] = [];

              console.log(`[getSubscriptions] Обработка подписки ${sub.id}:`, {
                name: sub.name,
                order_limit: sub.order_limit,
                active_orders_limit: (sub as any).active_orders_limit,
                commission_percent: (sub as any).commission_percent,
                fast_response: (sub as any).fast_response,
                all_fields: Object.keys(sub)
              });

              // Используем данные из БД для формирования фич
              // order_limit - это лимит откликов в день для исполнителей
              if (normalizedRole === "executor") {
                const orderLimit = Number(sub.order_limit || 0);
                if (orderLimit > 0) {
                  features.push(`${orderLimit} откликов в день`);
                }
              }

              // active_orders_limit - лимит активных заказов
              const activeOrdersLimit = Number((sub as any).active_orders_limit || 0);
              if (activeOrdersLimit > 0) {
                features.push(`До ${activeOrdersLimit} активных заказов`);
              } else if (sub.order_limit && normalizedRole === "logistic") {
                // Для логистов order_limit может означать лимит активных заказов
                features.push(`До ${sub.order_limit} активных заказов`);
              }

              // commission_percent - комиссия (может быть строкой или числом)
              const commissionPercent = (sub as any).commission_percent;
              if (commissionPercent !== null && commissionPercent !== undefined && commissionPercent !== "") {
                const commission = Number(commissionPercent);
                if (!isNaN(commission) && commission > 0) {
                  features.push(`Комиссия ${commission}%`);
                }
              } else if (tierInfo && "commission_pct" in tierInfo) {
                // Резерв: используем из tierInfo если нет в БД
                features.push(`Комиссия ${tierInfo.commission_pct}%`);
              }

              // Для логистов: daily_collected_limit (если есть в БД)
              if (normalizedRole === "logistic") {
                const dailyCollectedLimit = Number((sub as any).daily_collected_limit || 0);
                if (dailyCollectedLimit > 0) {
                  features.push(`До ${dailyCollectedLimit} собранных заказов в день`);
                } else if (tierInfo && "daily_collected_limit" in tierInfo) {
                  features.push(`До ${tierInfo.daily_collected_limit} собранных заказов в день`);
                }
              }

              console.log(`[getSubscriptions] Сформированные фичи для ${sub.id}:`, features);

              return {
                id: sub.id,
                name: sub.name,
                price: Number(sub.price || 0),
                role: normalizedRole,
                tier_key: tierKey,
                order_limit: sub.order_limit,
                features
              };
            });

            return successResponse({
              success: true,
              subscriptions: formattedSubscriptions
            });
          } catch (error) {
            console.error("[getSubscriptions] Исключение:", error);
            return errorResponse("Ошибка получения тарифов: " + (error.message || "Неизвестная ошибка"));
          }
        }
      // ========== 10) Регистрация пользователя ==========
      case "registerUser":
        {
          const { telegram_id, username, role = "executor", phone_number = null, card_number = null, bank_name = null } = body;
          if (!telegram_id) return errorResponse("telegram_id required");
          const telegramId = Number(telegram_id);
          // Проверяем, существует ли пользователь
          const { data: existingUser, error: checkError } = await supabase.from("users").select("telegram_id").eq("telegram_id", telegramId).single();
          if (existingUser) {
            return errorResponse("User already exists");
          }
          
          // Получаем subscription_id для бесплатной подписки исполнителя
          let subscriptionId = null;
          if (role === "executor") {
            const { data: freeSubscription, error: subError } = await supabase
              .from("subscriptions")
              .select("id")
              .eq("role", "executor")
              .order("price", { ascending: true })
              .limit(1)
              .single();
            
            if (!subError && freeSubscription) {
              subscriptionId = freeSubscription.id;
            }
          }
          
          // Обрабатываем аватарку если она есть (FormData)
          let avatarUrl = null;
          if (isFormData && body.avatar) {
            const avatarFile = body.avatar;
            console.log("[registerUser] Загрузка аватарки:", {
              name: avatarFile.name,
              size: avatarFile.size,
              type: avatarFile.type
            });
            
            try {
              // Проверяем размер файла (максимум 5 МБ)
              const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
              if (avatarFile.size > MAX_FILE_SIZE) {
                console.error("[registerUser] Аватарка слишком большая:", avatarFile.size);
                return errorResponse("Размер аватарки не должен превышать 5 МБ");
              }
              
              // Получаем данные файла
              let fileData = null;
              let fileName = `avatar_${telegramId}_${Date.now()}.jpg`;
              let contentType = 'image/jpeg';
              
              if (avatarFile instanceof File) {
                fileData = await avatarFile.arrayBuffer();
                fileName = avatarFile.name || fileName;
                contentType = avatarFile.type || contentType;
              } else if (avatarFile instanceof Blob) {
                fileData = await avatarFile.arrayBuffer();
                contentType = avatarFile.type || contentType;
              }
              
              if (fileData && fileData.byteLength > 0) {
                // Определяем расширение файла
                const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
                const storageFileName = `avatars/${telegramId}_${Date.now()}.${fileExt}`;
                
                // Загружаем в Supabase Storage
                const uint8Array = new Uint8Array(fileData);
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('avatars')
                  .upload(storageFileName, uint8Array, {
                    contentType: contentType,
                    upsert: false
                  });
                
                if (uploadError) {
                  console.error("[registerUser] Ошибка загрузки аватарки:", uploadError);
                  return errorResponse("Ошибка загрузки аватарки");
                }
                
                // Получаем публичный URL
                const { data: urlData } = supabase.storage
                  .from('avatars')
                  .getPublicUrl(storageFileName);
                
                if (urlData?.publicUrl) {
                  avatarUrl = urlData.publicUrl;
                  console.log("[registerUser] Аватарка загружена:", avatarUrl);
                }
              }
            } catch (avatarErr) {
              console.error("[registerUser] Исключение при загрузке аватарки:", avatarErr);
              return errorResponse("Ошибка обработки аватарки");
            }
          }
          
          // Автоматически назначаем подписку "Basic Logistic" для новых логистов
          let finalSubscriptionId = subscriptionId;
          if (role === "logistic" && !subscriptionId) {
            finalSubscriptionId = "31f51c23-44d4-4120-b79c-63538362460b"; // Basic Logistic
            console.log("[registerUser] Автоматически назначена подписка Basic Logistic для логиста");
          }

          console.log("[registerUser] Регистрация пользователя:", {
            telegram_id: telegramId,
            username,
            role,
            subscription_id: finalSubscriptionId,
            phone_number: phone_number,
            card_number: card_number,
            bank_name: bank_name,
            avatar_url: avatarUrl
          });
          // ИЗМЕНЕНИЕ: При регистрации даем 50 баллов рейтинга (0-100)
          const initialRating = "50";
          // Для исполнителей даем 1000 на баланс при регистрации
          const initialBalance = "1000";
          // Создаем нового пользователя
          const { data: newUser, error: createError } = await supabase.from("users").insert({
            telegram_id: telegramId,
            username: username || `executor_${telegramId}`,
            role: role,
            balance: initialBalance,
            hold_balance: "0",
            rating: initialRating,
            subscription_id: finalSubscriptionId,
            phone_number: phone_number,
            card_number: card_number,
            bank_name: bank_name,
            avatar_url: avatarUrl,
            daily_applies_count: 0,
            active_jobs_count: 0,
            daily_collected_count: 0,
            active_orders: 0
          }).select().single();
          if (createError) {
            console.error("[registerUser] Ошибка создания пользователя:", createError);
            return errorResponse(createError.message);
          }
          return successResponse({
            success: true,
            user: newUser
          });
        }
      // ========== 10) Оценка характеристик исполнителя после завершения заказа ==========
      case "ratePerformer":
        {
          const { order_id, logist_id, performer_id, result, punctuality, communication } = body;
          if (!order_id || !logist_id || !performer_id) {
            return errorResponse("order_id, logist_id, and performer_id required");
          }
          if (typeof result !== 'number' || typeof punctuality !== 'number' || typeof communication !== 'number') {
            return errorResponse("result, punctuality, and communication must be numbers (1-5)");
          }
          if (result < 1 || result > 5 || punctuality < 1 || punctuality > 5 || communication < 1 || communication > 5) {
            return errorResponse("result, punctuality, and communication must be between 1 and 5");
          }
          // Проверяем, что заказ существует и принадлежит логисту
          const { data: order, error: orderErr } = await supabase.from("orders").select("id, created_by, status").eq("id", order_id).single();
          if (orderErr || !order) {
            return errorResponse("Order not found");
          }
          const logistTelegramId = Number(logist_id);
          if (Number(order.created_by) !== logistTelegramId) {
            return errorResponse("Not authorized");
          }
          // Сохраняем оценку характеристик
          const performerTelegramId = Number(performer_id);
          const { error: saveErr } = await saveRatingCharacteristics(supabase, order_id, performerTelegramId, logistTelegramId, result, punctuality, communication);
          if (saveErr) {
            console.error("[ratePerformer] Ошибка сохранения оценки:", saveErr);
            return errorResponse("Error saving rating");
          }
          // ИЗМЕНЕНИЕ: Помечаем уведомление о необходимости оценки как прочитанное
          // Ищем все непрочитанные уведомления логиста и фильтруем по payload
          const { data: allNotifications } = await supabase.from("notifications").select("id, payload").eq("user_id", logistTelegramId).eq("read", false);
          if (allNotifications) {
            for (const notif of allNotifications){
              try {
                const payload = typeof notif.payload === 'string' ? JSON.parse(notif.payload) : notif.payload;
                if (payload.type === "pending_rating_logist" && payload.order_id === order_id && payload.performer_id === performerTelegramId) {
                  // Найдено нужное уведомление, помечаем как прочитанное
                  await supabase.from("notifications").update({
                    read: true
                  }).eq("id", notif.id);
                  break;
                }
              } catch (e) {
                console.error("[ratePerformer] Ошибка парсинга payload:", e);
              }
            }
          }
          return successResponse({
            success: true,
            message: "Rating saved successfully"
          });
        }
      // ========== 11) Оценка характеристик логиста после завершения заказа ==========
      case "rateLogist":
      case "submitLogistRating":
        {
          const { order_id, logist_id, performer_id, result, punctuality, communication, notification_id } = body;
          if (!order_id || !logist_id || !performer_id) {
            return errorResponse("order_id, logist_id, and performer_id required");
          }
          if (typeof result !== 'number' || typeof punctuality !== 'number' || typeof communication !== 'number') {
            return errorResponse("result, punctuality, and communication must be numbers (1-5)");
          }
          if (result < 1 || result > 5 || punctuality < 1 || punctuality > 5 || communication < 1 || communication > 5) {
            return errorResponse("result, punctuality, and communication must be between 1 and 5");
          }
          // Проверяем, что заказ существует
          const { data: order, error: orderErr } = await supabase.from("orders").select("id, created_by, status").eq("id", order_id).single();
          if (orderErr || !order) {
            return errorResponse("Order not found");
          }
          const logistTelegramId = Number(logist_id);
          const performerTelegramId = Number(performer_id);
          // Проверяем, что логист создал заказ
          if (Number(order.created_by) !== logistTelegramId) {
            return errorResponse("Invalid logist_id for this order");
          }
          // Проверяем, что исполнитель участвовал в заказе
          const { data: response, error: responseErr } = await supabase.from("order_responses").select("id, user_id, order_id, status").eq("order_id", order_id).eq("user_id", performerTelegramId).single();
          if (responseErr || !response) {
            return errorResponse("Performer did not participate in this order");
          }
          // Сохраняем оценку характеристик логиста
          const { error: saveErr } = await saveLogistRatingCharacteristics(supabase, order_id, logistTelegramId, performerTelegramId, result, punctuality, communication);
          if (saveErr) {
            console.error("[rateLogist] Ошибка сохранения оценки:", saveErr);
            return errorResponse("Error saving rating");
          }
          // ИЗМЕНЕНИЕ: Помечаем уведомление о необходимости оценки как прочитанное
          // Если передан notification_id – помечаем его напрямую,
          // иначе ищем все непрочитанные уведомления исполнителя и фильтруем по payload
          if (notification_id) {
            const { error: notifUpdateErr } = await supabase.from("notifications").update({
              read: true
            }).eq("id", notification_id);
            if (notifUpdateErr) {
              console.error("[submitLogistRating] Ошибка обновления уведомления по notification_id:", notifUpdateErr);
            }
          } else {
            const { data: allNotifications } = await supabase.from("notifications").select("id, payload").eq("user_id", performerTelegramId).eq("read", false);
            if (allNotifications) {
              for (const notif of allNotifications){
                try {
                  const payload = typeof notif.payload === 'string' ? JSON.parse(notif.payload) : notif.payload;
                  if (payload.type === "pending_rating_performer" && payload.order_id === order_id && payload.logist_id === logistTelegramId) {
                    // Найдено нужное уведомление, помечаем как прочитанное
                    await supabase.from("notifications").update({
                      read: true
                    }).eq("id", notif.id);
                    break;
                  }
                } catch (e) {
                  console.error("[rateLogist] Ошибка парсинга payload:", e);
                }
              }
            }
          }
          return successResponse({
            success: true,
            message: "Rating saved successfully"
          });
        }
      // ========== 11) Штраф за отказ от заказа исполнителем ==========
      case "penalizePerformerForCancellation":
        {
          const { order_id, performer_id, cancellation_reason, hours_before_start } = body;
          if (!order_id || !performer_id) {
            return errorResponse("order_id and performer_id required");
          }
          const performerTelegramId = Number(performer_id);
          const hoursBefore = Number(hours_before_start || 0);
          // Определяем штраф в зависимости от времени до начала заказа
          let penalty = 0;
          if (hoursBefore >= 24) {
            penalty = -3; // Отказ за 24+ часов до начала
          } else if (hoursBefore >= 3) {
            penalty = -5; // Отказ за 3-24 часа до начала
          } else if (hoursBefore > 0) {
            penalty = -10; // Отказ за менее чем 3 часа до начала
          } else {
            penalty = -20; // Не прибытие на место исполнения
          }
          // Обновляем рейтинг
          const { error: updateErr } = await updateUserRating(supabase, performerTelegramId, penalty, `Штраф за отказ от заказа #${order_id}: ${cancellation_reason || 'Не указана причина'}`);
          if (updateErr) {
            console.error("[penalizePerformerForCancellation] Ошибка обновления рейтинга:", updateErr);
            return errorResponse("Error updating rating");
          }
          return successResponse({
            success: true,
            penalty,
            message: "Penalty applied successfully"
          });
        }
      // ========== 12) Штраф за косяки через поддержку ==========
      case "penalizePerformerForIssue":
        {
          const { order_id, performer_id, issue_type } = body;
          if (!order_id || !performer_id || !issue_type) {
            return errorResponse("order_id, performer_id, and issue_type required");
          }
          const performerTelegramId = Number(performer_id);
          // Штраф -25 баллов за косяки через поддержку
          const penalty = -25;
          // Обновляем рейтинг
          const { error: updateErr } = await updateUserRating(supabase, performerTelegramId, penalty, `Штраф за проблему в заказе #${order_id}: ${issue_type}`);
          if (updateErr) {
            console.error("[penalizePerformerForIssue] Ошибка обновления рейтинга:", updateErr);
            return errorResponse("Error updating rating");
          }
          return successResponse({
            success: true,
            penalty,
            message: "Penalty applied successfully"
          });
        }
      // ========== 13) Бонус за заполнение данных профиля ==========
      case "addProfileDataBonus":
        {
          const { user_id, data_type } = body; // data_type: "passport", "payout", "photo"
          if (!user_id || !data_type) {
            return errorResponse("user_id and data_type required");
          }
          const userTelegramId = Number(user_id);
          let bonus = 0;
          let reason = "";
          switch(data_type){
            case "passport":
              bonus = 30;
              reason = "Подтверждение паспортных данных";
              break;
            case "payout":
              bonus = 10;
              reason = "Заполнение данных для выплат";
              break;
            case "photo":
              bonus = 10;
              reason = "Загрузка фотографии в профиль";
              break;
            default:
              return errorResponse("Invalid data_type. Must be 'passport', 'payout', or 'photo'");
          }
          // Обновляем рейтинг
          const { error: updateErr, newRating } = await updateUserRating(supabase, userTelegramId, bonus, reason);
          if (updateErr) {
            console.error("[addProfileDataBonus] Ошибка обновления рейтинга:", updateErr);
            return errorResponse("Error updating rating");
          }
          return successResponse({
            success: true,
            bonus,
            new_rating: newRating,
            message: "Bonus applied successfully"
          });
        }
      // ========== 14) Получение незавершенных оценок ==========
      case "getPendingRatings":
        {
          const { user_id, role } = body; // role: "logist" или "performer"
          console.log("[getPendingRatings] Начало обработки запроса:", {
            user_id,
            role
          });
          if (!user_id) {
            console.error("[getPendingRatings] Отсутствует user_id");
            return errorResponse("user_id required");
          }
          if (!role) {
            console.error("[getPendingRatings] Отсутствует role");
            return errorResponse("role required");
          }
          const telegramId = Number(user_id);
          console.log("[getPendingRatings] telegramId:", telegramId, "type:", typeof telegramId);
          if (isNaN(telegramId)) {
            console.error("[getPendingRatings] Неверный telegramId (не число):", user_id);
            return errorResponse("Invalid user_id");
          }
          // Ищем все непрочитанные уведомления пользователя
          // Пробуем разные варианты: сначала с read = false, затем все непрочитанные
          let notifications = null;
          let notifErr = null;
          // Пробуем получить все уведомления пользователя через select("*"), чтобы увидеть реальную структуру
          console.log("[getPendingRatings] Попытка получить уведомления для user_id:", telegramId);
          let { data: allNotif, error: errAll } = await supabase.from("notifications").select("*").eq("user_id", telegramId).order("created_at", {
            ascending: false
          });
          if (errAll) {
            console.error("[getPendingRatings] Ошибка при получении уведомлений:", errAll);
            console.error("[getPendingRatings] Детали ошибки:", JSON.stringify(errAll, null, 2));
            // Если ошибка связана с отсутствием колонки payload, но таблица существует,
            // возвращаем пустой список с предупреждением
            if (errAll.message && errAll.message.includes("does not exist")) {
              console.warn("[getPendingRatings] ⚠️ Колонка не существует. Таблица notifications может иметь другую структуру.");
              console.warn("[getPendingRatings] ⚠️ Нужно добавить колонку payload в таблицу notifications или проверить структуру таблицы.");
              // Возвращаем успешный ответ с пустым списком, чтобы не сломать приложение
              return successResponse({
                success: true,
                pending_ratings: [],
                warning: "Notifications table structure mismatch. Please add 'payload' column to notifications table."
              });
            }
            return errorResponse("Error fetching pending ratings: " + (errAll.message || JSON.stringify(errAll)));
          }
          console.log("[getPendingRatings] Получено всего уведомлений:", allNotif?.length || 0);
          // Проверяем структуру первой записи, чтобы понять, какие колонки есть
          if (allNotif && allNotif.length > 0) {
            const firstNotif = allNotif[0];
            const keys = Object.keys(firstNotif);
            console.log("[getPendingRatings] Колонки в таблице notifications:", keys);
            console.log("[getPendingRatings] Первая запись (пример):", JSON.stringify(firstNotif, null, 2));
            // Если нет колонки payload, но есть другие колонки, пробуем найти нужную
            if (!firstNotif.payload) {
              console.warn("[getPendingRatings] ⚠️ Колонка 'payload' не найдена. Доступные колонки:", keys);
              // Пробуем разные варианты названий колонок
              let payloadColumn = null;
              if (firstNotif.data) {
                payloadColumn = "data";
              } else if (firstNotif.message) {
                payloadColumn = "message";
              } else if (firstNotif.content) {
                payloadColumn = "content";
              } else if (firstNotif.body) {
                payloadColumn = "body";
              } else if (firstNotif.text) {
                payloadColumn = "text";
              }
              if (payloadColumn) {
                console.log("[getPendingRatings] ✅ Найдена альтернативная колонка:", payloadColumn);
                // Переименовываем колонку в payload для совместимости
                allNotif = allNotif.map((n)=>({
                    ...n,
                    payload: n[payloadColumn]
                  }));
              } else {
                console.error("[getPendingRatings] ❌ Не найдена колонка с данными уведомления");
                console.error("[getPendingRatings] Доступные колонки:", keys);
                return successResponse({
                  success: true,
                  pending_ratings: [],
                  warning: `Notification payload column not found. Available columns: ${keys.join(", ")}. Please add 'payload' TEXT column to notifications table.`
                });
              }
            }
          }
          // Фильтруем непрочитанные на клиенте
          // Пробуем разные варианты значения read
          notifications = (allNotif || []).filter((n)=>{
            const readValue = n.read;
            const isUnread = readValue === false || readValue === "false" || readValue === 0 || readValue === null || readValue === undefined || String(readValue).toLowerCase() === "false";
            if (!isUnread) {
              console.log("[getPendingRatings] Уведомление пропущено (прочитано):", {
                id: n.id,
                read: readValue,
                readType: typeof readValue
              });
            }
            return isUnread;
          });
          console.log("[getPendingRatings] Отфильтровано непрочитанных уведомлений:", notifications?.length || 0);
          // Убеждаемся, что notifications это массив
          if (!notifications) {
            notifications = [];
          }
          console.log("[getPendingRatings] Всего непрочитанных уведомлений:", notifications.length);
          if (notifications.length > 0) {
            console.log("[getPendingRatings] Первые 3 уведомления:", notifications.slice(0, 3).map((n)=>{
              try {
                const p = typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload;
                return {
                  id: n.id,
                  payload_type: p.type,
                  created_at: n.created_at
                };
              } catch (e) {
                return {
                  id: n.id,
                  payload: "parse_error",
                  created_at: n.created_at
                };
              }
            }));
          }
          // Парсим payload и фильтруем по типу и роли
          const pendingRatings = [];
          if (notifications && notifications.length > 0) {
            for (const notif of notifications){
              try {
                const payload = typeof notif.payload === 'string' ? JSON.parse(notif.payload) : notif.payload;
                console.log("[getPendingRatings] Обработка уведомления:", {
                  id: notif.id,
                  payload_type: payload.type,
                  role
                });
                // Для логиста - ищем pending_rating_logist
                if (payload.type === "pending_rating_logist" && (role === "logist" || role === "logistic")) {
                  console.log("[getPendingRatings] Найдено уведомление pending_rating_logist для логиста, order_id:", payload.order_id, "performer_id:", payload.performer_id);
                  // Проверяем, была ли уже выставлена оценка для этого исполнителя и заказа
                  // ИЗМЕНЕНИЕ: Проверяем в таблице ratings вместо transactions
                  const { data: existingRating, error: ratingCheckError } = await supabase.from("ratings").select("id").eq("order_id", payload.order_id).eq("rater_id", telegramId).eq("rated_id", payload.performer_id).eq("rater_role", "logist").eq("rated_role", "performer").limit(1);
                  if (ratingCheckError) {
                    console.error("[getPendingRatings] Ошибка проверки существующей оценки:", ratingCheckError);
                    // Если таблицы ratings нет, пробуем проверить в transactions для совместимости
                    const { data: existingRatingOld, error: ratingCheckErrorOld } = await supabase.from("transactions").select("id").eq("user_id", payload.performer_id).eq("order_id", payload.order_id).eq("type", "rating").limit(1);
                    if (ratingCheckErrorOld) {
                      console.error("[getPendingRatings] Ошибка проверки существующей оценки в transactions:", ratingCheckErrorOld);
                    } else {
                      console.log("[getPendingRatings] Существующая оценка найдена в transactions:", existingRatingOld?.length || 0);
                      if (existingRatingOld && existingRatingOld.length > 0) {
                        continue;
                      }
                    }
                  } else {
                    console.log("[getPendingRatings] Существующая оценка найдена в ratings:", existingRating?.length || 0);
                  }
                  // Если оценка еще не выставлена, добавляем в список
                  if (!existingRating || existingRating.length === 0) {
                    // Получаем информацию о заказе и исполнителе
                    const { data: order } = await supabase.from("orders").select("id, title").eq("id", payload.order_id).single();
                    const { data: performer } = await supabase.from("users").select("id, username, telegram_id").eq("telegram_id", payload.performer_id).single();
                    pendingRatings.push({
                      notification_id: notif.id,
                      order_id: payload.order_id,
                      order_title: order?.title || `Заказ #${payload.order_id}`,
                      performer_id: payload.performer_id,
                      performer_name: performer?.username || performer?.name || "Исполнитель",
                      role: "logist",
                      created_at: notif.created_at
                    });
                  } else {
                    // Оценка уже выставлена, помечаем уведомление как прочитанное
                    await supabase.from("notifications").update({
                      read: true
                    }).eq("id", notif.id);
                  }
                } else if (payload.type === "pending_rating_performer" && (role === "performer" || role === "executor")) {
                  console.log("[getPendingRatings] Найдено уведомление pending_rating_performer для исполнителя, order_id:", payload.order_id, "logist_id:", payload.logist_id);
                  // ИЗМЕНЕНИЕ: Проверяем, была ли уже выставлена оценка логиста исполнителем
                  const { data: existingRating, error: ratingCheckError } = await supabase.from("ratings").select("id").eq("order_id", payload.order_id).eq("rater_id", telegramId).eq("rated_id", payload.logist_id).eq("rater_role", "performer").eq("rated_role", "logist").limit(1);
                  if (ratingCheckError) {
                    console.error("[getPendingRatings] Ошибка проверки существующей оценки логиста:", ratingCheckError);
                  // Если таблицы ratings нет, считаем что оценка не выставлена
                  } else {
                    console.log("[getPendingRatings] Существующая оценка логиста найдена:", existingRating?.length || 0);
                    if (existingRating && existingRating.length > 0) {
                      // Оценка уже выставлена, помечаем уведомление как прочитанное
                      await supabase.from("notifications").update({
                        read: true
                      }).eq("id", notif.id);
                      continue; // Пропускаем это уведомление
                    }
                  }
                  // Если оценка еще не выставлена, добавляем в список
                  const { data: order } = await supabase.from("orders").select("id, title").eq("id", payload.order_id).single();
                  const { data: logist } = await supabase.from("users").select("id, username, telegram_id").eq("telegram_id", payload.logist_id).single();
                  pendingRatings.push({
                    notification_id: notif.id,
                    order_id: payload.order_id,
                    order_title: order?.title || `Заказ #${payload.order_id}`,
                    logist_id: payload.logist_id,
                    logist_name: logist?.username || logist?.name || "Логист",
                    role: "performer",
                    created_at: notif.created_at
                  });
                }
              } catch (e) {
                console.error("[getPendingRatings] Ошибка парсинга payload:", e, notif);
              }
            }
          }
          console.log("[getPendingRatings] Итого незавершенных оценок:", pendingRatings.length);
          return successResponse({
            success: true,
            pending_ratings: pendingRatings
          });
        }
      // ========== 15) Отметка оценки как завершенной ==========
      case "markRatingCompleted":
        {
          const { notification_id } = body;
          if (!notification_id) {
            return errorResponse("notification_id required");
          }
          // Помечаем уведомление как прочитанное
          const { error: updateErr } = await supabase.from("notifications").update({
            read: true
          }).eq("id", notification_id);
          if (updateErr) {
            console.error("[markRatingCompleted] Ошибка обновления уведомления:", updateErr);
            return errorResponse("Error updating notification");
          }
          return successResponse({
            success: true,
            message: "Rating marked as completed"
          });
        }
      // ========== 16) Получение уведомлений ==========
      case "getNotifications":
        {
          const { user_id } = body;
          if (!user_id) return errorResponse("user_id required");
          const userTelegramId = Number(user_id);
          const { data: notifications, error: notifErr } = await supabase.from("notifications").select("*").eq("user_id", userTelegramId).order("created_at", {
            ascending: false
          }).limit(50);
          if (notifErr) {
            console.error("[getNotifications] Ошибка:", notifErr);
            return errorResponse("Ошибка получения уведомлений");
          }
          return successResponse({
            success: true,
            notifications: notifications || []
          });
        }
      // ========== 17) Отметка уведомления как прочитанного ==========
      case "markNotificationAsRead":
        {
          const { notification_id } = body;
          if (!notification_id) return errorResponse("notification_id required");
          const { error: updateErr } = await supabase.from("notifications").update({
            read: true,
            is_read: true
          }).eq("id", notification_id);
          if (updateErr) {
            console.error("[markNotificationAsRead] Ошибка:", updateErr);
            return errorResponse("Ошибка обновления уведомления");
          }
          return successResponse({
            success: true
          });
        }
      // ========== 18) Unknown action ==========
      default:
        console.warn("[user-orders] Unknown action:", action);
        return new Response(JSON.stringify({
          error: "Unknown action"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
    }
  } catch (e) {
    console.error("[user-orders] Server error:", e);
    return new Response(JSON.stringify({
      error: e?.message || String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
