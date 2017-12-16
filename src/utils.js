/* @flow */
export const BLOCKSTACK_HANDLER = 'blockstack'
/**
 * Time
 * @private
 */

export function nextYear() {
  return new Date(
    new Date().setFullYear(
      new Date().getFullYear() + 1
    )
  )
}

export function nextMonth() {
  return new Date(
    new Date().setMonth(
      new Date().getMonth() + 1
    )
  )
}

export function nextHour() {
  return new Date(
    new Date().setHours(
      new Date().getHours() + 1
    )
  )
}

/**
 * Query Strings
 * @private
 */

export function updateQueryStringParameter(uri: string, key: string, value: string) {
  const re = new RegExp(`([?&])${key}=.*?(&|$)`, 'i')
  const separator = uri.indexOf('?') !== -1 ? '&' : '?'
  if (uri.match(re)) {
    return uri.replace(re, `$1${key}=${value}$2`)
  } else {
    return `${uri}${separator}${key}=${value}`
  }
}

/**
 * Versioning
 * @param {string} v1 - the left half of the version inequality
 * @param {string} v2 - right half of the version inequality
 * @returns {bool} iff v1 >= v2
 */
export function isLaterVersion(v1: string, v2: string) {
  const v1tuple = v1.split('.').map(x => parseInt(x, 10))
  const v2tuple = v2.split('.').map(x => parseInt(x, 10))

  for (let index = 0; index < v2.length; index++) {
    if (index >= v1.length) {
      v2tuple.push(0)
    }
    if (v1tuple[index] < v2tuple[index]) {
      return false
    }
  }
  return true
}

/**
 * UUIDs
 * @private
 */

export function makeUUID4() {
  let d = new Date().getTime()
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    d += performance.now() // use high-precision timer if available
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0
    d = Math.floor(d / 16)
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
