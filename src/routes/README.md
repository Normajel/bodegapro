# Rutas

TanStack Start usa **enrutamiento basado en archivos**: cada archivo `.tsx` de este directorio define una ruta. No crees `src/pages/`, `src/routes/_app/index.tsx` ni `app/layout.tsx` (son convenciones de Next.js o Remix). El único layout raíz es `src/routes/__root.tsx`.

## Convenciones

| Archivo | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dinámica: solo `$`, sin llaves) |
| `posts/{-$category}.tsx` | `/posts/:category?` (segmento opcional) |
| `files/$.tsx` | `/files/*` (comodín: se lee con el parámetro `_splat`, nunca `*`) |
| `_layout.tsx` | ruta de layout (renderiza a sus hijas con `<Outlet />`) |
| `__root.tsx` | contenedor de la app; conserva el `<Outlet />` |

`routeTree.gen.ts` se genera automáticamente. No lo edites a mano.
