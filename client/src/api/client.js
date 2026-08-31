const TOKEN_KEY = 'atm_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Thin fetch wrapper: attaches the bearer token, parses JSON, and turns a
 * non-2xx response into a thrown Error carrying the server's message.
 */
async function request(path, { method = 'GET', body, signal } = {}) {
  const token = tokenStore.get();

  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // An expired session should drop the user back to the sign-in screen.
    if (res.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }

  return data;
}

export const api = {
  // auth
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),

  // projects
  listProjects: () => request('/projects'),
  createProject: (payload) => request('/projects', { method: 'POST', body: payload }),
  getProject: (id) => request(`/projects/${id}`),
  updateProject: (id, payload) => request(`/projects/${id}`, { method: 'PATCH', body: payload }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  addMember: (id, email) =>
    request(`/projects/${id}/members`, { method: 'POST', body: { email } }),
  removeMember: (id, userId) =>
    request(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),

  // sprints
  listSprints: (projectId) => request(`/projects/${projectId}/sprints`),
  createSprint: (projectId, payload) =>
    request(`/projects/${projectId}/sprints`, { method: 'POST', body: payload }),
  updateSprint: (projectId, sprintId, payload) =>
    request(`/projects/${projectId}/sprints/${sprintId}`, { method: 'PATCH', body: payload }),
  deleteSprint: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}`, { method: 'DELETE' }),
  getBurndown: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}/burndown`),

  // tasks
  listTasks: (projectId, query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return request(`/projects/${projectId}/tasks${qs ? `?${qs}` : ''}`);
  },
  getTask: (projectId, taskId) => request(`/projects/${projectId}/tasks/${taskId}`),

  // comments
  listComments: (projectId, taskId) =>
    request(`/projects/${projectId}/tasks/${taskId}/comments`),
  createComment: (projectId, taskId, payload) =>
    request(`/projects/${projectId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: payload,
    }),
  deleteComment: (projectId, taskId, commentId) =>
    request(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  // activity / audit trail
  listActivity: (projectId, query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return request(`/projects/${projectId}/activity${qs ? `?${qs}` : ''}`);
  },
  listTaskActivity: (projectId, taskId) =>
    request(`/projects/${projectId}/tasks/${taskId}/activity`),

  // team workload
  getTeamWorkload: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}/workload`),

  createTask: (projectId, payload) =>
    request(`/projects/${projectId}/tasks`, { method: 'POST', body: payload }),
  updateTask: (projectId, taskId, payload) =>
    request(`/projects/${projectId}/tasks/${taskId}`, { method: 'PATCH', body: payload }),
  deleteTask: (projectId, taskId) =>
    request(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' }),
  moveTask: (projectId, taskId, payload) =>
    request(`/projects/${projectId}/tasks/${taskId}/move`, { method: 'PATCH', body: payload }),

  // dependencies
  addDependency: (projectId, taskId, dependsOn) =>
    request(`/projects/${projectId}/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: { dependsOn },
    }),
  removeDependency: (projectId, taskId, dependencyId) =>
    request(`/projects/${projectId}/tasks/${taskId}/dependencies/${dependencyId}`, {
      method: 'DELETE',
    }),
  getDependencyGraph: (projectId, query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return request(`/projects/${projectId}/dependency-graph${qs ? `?${qs}` : ''}`);
  },

  // predictive analytics
  getSprintHealth: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}/health`),
  getCriticalPath: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}/critical-path`),
  getForecast: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}/forecast`),
  getScopeCreep: (projectId, sprintId) =>
    request(`/projects/${projectId}/sprints/${sprintId}/scope-creep`),
  getEstimationAccuracy: (projectId, query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return request(`/projects/${projectId}/estimation-accuracy${qs ? `?${qs}` : ''}`);
  },

  // risk register
  listRisks: (projectId) => request(`/projects/${projectId}/risks`),
  createRisk: (projectId, payload) =>
    request(`/projects/${projectId}/risks`, { method: 'POST', body: payload }),
  updateRisk: (projectId, riskId, payload) =>
    request(`/projects/${projectId}/risks/${riskId}`, { method: 'PATCH', body: payload }),
  deleteRisk: (projectId, riskId) =>
    request(`/projects/${projectId}/risks/${riskId}`, { method: 'DELETE' }),
};
