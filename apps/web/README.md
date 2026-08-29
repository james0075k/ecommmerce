# @bazaar/web

Next.js storefront and admin panel for Bazaar. Runs on **:3000**.

Setup and architecture live in the [root README](../../README.md).

## Layout

```
src/
├── app/
│   ├── layout.tsx       fonts · metadata · providers
│   ├── globals.css      Tailwind 4 theme mapped onto the Bazaar tokens
│   ├── (shop)/          storefront
│   ├── (auth)/          login · register · password reset      (Phase 2)
│   └── (admin)/         dashboard · products · orders          (Phase 8)
├── components/
│   ├── ui/              shadcn primitives - regenerate with `npx shadcn add`
│   ├── shop/  admin/  layout/  animations/
├── lib/                 utils, api client, zustand stores, hooks
```

## Notes

- `/` is currently a **Phase 1 verification page** that renders the design system and probes
  the API. Phase 9 replaces it with the real homepage.
- Design tokens are not defined here. They live in `@bazaar/ui` and are mapped onto shadcn's
  CSS variables in `globals.css`, so components inherit the brand automatically.
- Dark is the default theme; the toggle swaps icons with CSS rather than mount state, so there
  is no hydration flash.
- Adding a shadcn component: `npx shadcn@latest add <name>` from this directory.
