const API_BASE = '/api'

export async function apiRequest(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the StudySignal API. Make sure the backend server is running.')
  }

  if (response.status === 204) return null
  const payload = await response.json()
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed with status ${response.status}.`)
    error.status = response.status
    error.details = payload.error?.details
    throw error
  }
  return payload.data
}

export function get(path) {
  return apiRequest(path)
}

export function create(path, data) {
  return apiRequest(path, { method: 'POST', body: JSON.stringify(data) })
}

export function update(path, data) {
  return apiRequest(path, { method: 'PATCH', body: JSON.stringify(data) })
}

export function remove(path) {
  return apiRequest(path, { method: 'DELETE' })
}
