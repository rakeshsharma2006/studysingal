const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

function apiError(message, status, requestId) {
  const error = new Error(message)
  error.status = status
  error.requestId = requestId
  return error
}

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
  const requestId = response.headers.get('x-request-id')
  const contentType = response.headers.get('content-type') || ''
  if (!/^application\/(?:json|[\w.-]+\+json)\s*(?:;|$)/i.test(contentType)) {
    throw apiError(
      `The StudySignal API returned a non-JSON response (HTTP ${response.status}). Check the backend deployment and API URL.`,
      response.status,
      requestId,
    )
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw apiError(
      `The StudySignal API returned invalid JSON (HTTP ${response.status}). Check the backend deployment logs.`,
      response.status,
      requestId,
    )
  }
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed with status ${response.status}.`)
    error.status = response.status
    error.details = payload.error?.details
    error.requestId = payload.error?.requestId || requestId
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
