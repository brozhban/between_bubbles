import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { RootLayout } from './root-layout'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages'), 'HomePage'),
})

const addRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/add',
  component: lazyRouteComponent(() => import('./pages'), 'AddEntryPage'),
})

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entries/$entryId',
  component: lazyRouteComponent(() => import('./pages'), 'EntryPage'),
})

const editEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entries/$entryId/edit',
  component: lazyRouteComponent(() => import('./pages'), 'EditEntryPage'),
})

const winesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wines',
  component: lazyRouteComponent(() => import('./pages'), 'WinesPage'),
})

const wineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wines/$wineId',
  component: lazyRouteComponent(() => import('./pages'), 'WinePage'),
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: lazyRouteComponent(() => import('./pages'), 'ProfilePage'),
})

/** Админка справочника магазинов (ТЗ §10.12): экран открыт только администратору. */
const adminStoresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/stores',
  component: lazyRouteComponent(() => import('./pages'), 'AdminStoresPage'),
})

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  component: lazyRouteComponent(() => import('./pages'), 'StatsPage'),
})

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trash',
  component: lazyRouteComponent(() => import('./pages'), 'TrashPage'),
})

/**
 * Экраны по ссылке из письма (ТЗ §13). Открыты без сессии: по ссылке на восстановление
 * пароля приходят как раз тогда, когда войти не получается.
 */
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: lazyRouteComponent(() => import('./pages'), 'ResetPasswordPage'),
})

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: lazyRouteComponent(() => import('./pages'), 'VerifyEmailPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  addRoute,
  entryRoute,
  editEntryRoute,
  winesRoute,
  wineRoute,
  profileRoute,
  statsRoute,
  adminStoresRoute,
  trashRoute,
  resetPasswordRoute,
  verifyEmailRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export { editEntryRoute, entryRoute, resetPasswordRoute, verifyEmailRoute, wineRoute }
