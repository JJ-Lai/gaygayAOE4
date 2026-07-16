import { useEffect } from 'react'

export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}

function upsertMetaAttribute(selector: string, create: () => HTMLElement, content: string) {
  let element = document.querySelector(selector)
  const created = !element
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  const previous = element.getAttribute('content')
  element.setAttribute('content', content)
  return { element, created, previous }
}

export function useMetaTag(name: string, content: string) {
  useEffect(() => {
    const { element, created, previous } = upsertMetaAttribute(
      `meta[name="${name}"]`,
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('name', name)
        return meta
      },
      content,
    )
    return () => {
      if (created) {
        element.remove()
      } else if (previous != null) {
        element.setAttribute('content', previous)
      } else {
        element.removeAttribute('content')
      }
    }
  }, [name, content])
}

export function useOgMeta(tags: { title?: string; description?: string; url?: string }) {
  useEffect(() => {
    const cleanups: Array<() => void> = []

    if (tags.title) {
      const state = upsertMetaAttribute(
        'meta[property="og:title"]',
        () => {
          const meta = document.createElement('meta')
          meta.setAttribute('property', 'og:title')
          return meta
        },
        tags.title,
      )
      cleanups.push(() => restoreMeta(state))
    }

    if (tags.description) {
      const state = upsertMetaAttribute(
        'meta[property="og:description"]',
        () => {
          const meta = document.createElement('meta')
          meta.setAttribute('property', 'og:description')
          return meta
        },
        tags.description,
      )
      cleanups.push(() => restoreMeta(state))
    }

    if (tags.url) {
      const state = upsertMetaAttribute(
        'meta[property="og:url"]',
        () => {
          const meta = document.createElement('meta')
          meta.setAttribute('property', 'og:url')
          return meta
        },
        tags.url,
      )
      cleanups.push(() => restoreMeta(state))
    }

    const typeState = upsertMetaAttribute(
      'meta[property="og:type"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:type')
        return meta
      },
      'website',
    )
    cleanups.push(() => restoreMeta(typeState))

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [tags.title, tags.description, tags.url])
}

function restoreMeta(state: { element: Element; created: boolean; previous: string | null }) {
  if (state.created) {
    state.element.remove()
  } else if (state.previous != null) {
    state.element.setAttribute('content', state.previous)
  } else {
    state.element.removeAttribute('content')
  }
}
