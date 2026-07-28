/*
 * Офлайн-заглушка PWA (ТЗ §13).
 *
 * Полноценного офлайн-режима в MVP нет и не планируется: неделя, метрики и фото живут на
 * сервере, а кэшировать их означало бы показывать вчерашние цифры как сегодняшние. Поэтому
 * воркер делает ровно одно — вместо браузерной ошибки «нет интернета» показывает страницу
 * приложения, объясняющую, что происходит.
 *
 * Ассеты приложения намеренно не кэшируются: они версионируются по хешу в имени, и любой
 * самодельный кэш здесь означал бы риск отдать старый index.html к новым файлам.
 */

const CACHE_NAME = 'between-bubbles-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  // Только переходы по страницам: запросы к API должны падать честной ошибкой, чтобы экран
  // показал свой «попробуйте ещё раз», а не подменённую страницу.
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME)
      const offlinePage = await cache.match(OFFLINE_URL)
      return offlinePage ?? Response.error()
    }),
  )
})
