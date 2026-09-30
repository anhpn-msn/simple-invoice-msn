import { createBrowserRouter, redirect, type RouteObject } from 'react-router'
import { routePatterns, routes } from '@/shared/config'
import { redirectIfAuthenticatedLoader, requireAuthLoader } from './guards'
import { AppShell } from './layouts/app-shell/AppShell'
import { RouteError } from './RouteError'
import { RouteFallback } from './RouteFallback'

export const appRoutes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    HydrateFallback: RouteFallback,
    children: [
      {
        path: routePatterns.login,
        loader: redirectIfAuthenticatedLoader,
        lazy: async () => {
          const { LoginPage } = await import('@/pages/login')
          return { Component: LoginPage }
        },
      },
      {
        path: routePatterns.root,
        loader: requireAuthLoader,
        Component: AppShell,
        children: [
          { index: true, loader: () => redirect(routes.invoices) },
          {
            path: routePatterns.invoices,
            lazy: async () => {
              const { InvoiceListPage } = await import('@/pages/invoice-list')
              return { Component: InvoiceListPage }
            },
          },
          {
            path: routePatterns.invoiceNew,
            lazy: async () => {
              const { InvoiceCreatePage } = await import('@/pages/invoice-create')
              return { Component: InvoiceCreatePage }
            },
          },
          {
            path: routePatterns.invoiceDetail,
            lazy: async () => {
              const { InvoiceDetailPage } = await import('@/pages/invoice-detail')
              return { Component: InvoiceDetailPage }
            },
          },
        ],
      },
      {
        path: routePatterns.notFound,
        lazy: async () => {
          const { NotFoundPage } = await import('@/pages/not-found')
          return { Component: NotFoundPage }
        },
      },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(appRoutes)
}
