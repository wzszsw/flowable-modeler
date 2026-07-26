export function isEmbeddedMode() {
  return (
    window.self !== window.top ||
    new URLSearchParams(window.location.search).get('embedded') === '1'
  )
}
