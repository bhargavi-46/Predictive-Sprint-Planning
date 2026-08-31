/**
 * OpenAPI 3.1 description of the API, served at /api/docs.
 *
 * Written by hand rather than generated from decorators: the schemas in
 * schemas/index.js are the runtime contract, and a second generated artefact
 * that could silently drift from them would be worse than none. This document
 * covers the endpoints an integrator actually needs and stays deliberately
 * close to the Zod definitions.
 */

const bearerAuth = [{ bearerAuth: [] }];

const errorResponse = {
  description: 'Request failed',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'object', additionalProperties: true },
          requestId: { type: 'string', description: 'Correlates with server logs' },
        },
      },
    },
  },
};

const taskSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    reference: { type: 'string', example: 'ATM-14' },
    title: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: ['backlog', 'todo', 'inprogress', 'done'] },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    storyPoints: { type: 'integer', minimum: 0, maximum: 100 },
    actualPoints: { type: 'integer', nullable: true },
    dependsOn: { type: 'array', items: { type: 'object' } },
    version: {
      type: 'integer',
      description:
        'Optimistic-concurrency token. Send it back on PATCH; a mismatch returns 409.',
    },
    isOverdue: { type: 'boolean' },
  },
};

export const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Predictive Sprint Planning API',
    version: '1.0.0',
    description:
      'Sprint management with dependency-aware critical-path analysis, scope-creep ' +
      'detection against a frozen commitment baseline, and Monte Carlo delivery forecasting.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: { Task: taskSchema },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Liveness probe with cache and memory statistics',
        security: [],
        responses: { 200: { description: 'Service is healthy' } },
      },
    },

    '/auth/register': {
      post: {
        summary: 'Create an account',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 2, maxLength: 80 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Account created; returns a JWT' },
          400: errorResponse,
          409: errorResponse,
        },
      },
    },

    '/auth/login': {
      post: {
        summary: 'Exchange credentials for a JWT',
        description:
          'Rate limited to 10 failed attempts per 15 minutes per IP. Successful ' +
          'sign-ins are not counted against the budget.',
        security: [],
        responses: {
          200: { description: 'Returns a JWT' },
          400: errorResponse,
          401: errorResponse,
          429: errorResponse,
        },
      },
    },

    '/projects/{projectId}/tasks': {
      get: {
        summary: 'List tasks on a board, with filters',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'sprint',
            in: 'query',
            schema: { type: 'string' },
            description: 'A sprint id, or "backlog" for unscheduled work',
          },
          { name: 'assignee', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['backlog', 'todo', 'inprogress', 'done'] },
          },
          {
            name: 'priority',
            in: 'query',
            schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string', maxLength: 120 },
            description: 'Free-text match on title or reference',
          },
          {
            name: 'blocked',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
            description: 'Whether at least one dependency is still unfinished',
          },
          { name: 'overdue', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
          },
        ],
        responses: {
          200: {
            description: 'Matching tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
          400: errorResponse,
        },
      },
      post: {
        summary: 'Create a task',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 201: { description: 'Task created' }, 400: errorResponse },
      },
    },

    '/projects/{projectId}/tasks/{taskId}': {
      patch: {
        summary: 'Update a task',
        description:
          'Include the `version` you read to opt into optimistic concurrency control. ' +
          'If the task changed in the meantime the request fails with 409 and code ' +
          'STALE_VERSION rather than overwriting the other edit. Omitting `version` ' +
          'keeps last-write-wins for simple clients.',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Updated task' },
          400: errorResponse,
          409: {
            ...errorResponse,
            description: 'The task was modified by someone else (STALE_VERSION)',
          },
        },
      },
      delete: {
        summary: 'Delete a task',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },

    '/projects/{projectId}/tasks/{taskId}/dependencies': {
      post: {
        summary: 'Declare that this task is blocked by another',
        description:
          'Rejected with 409 when the edge would close a cycle, since a cyclic ' +
          'graph has no topological order and the critical path becomes undefined.',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['dependsOn'],
                properties: { dependsOn: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          201: { description: 'Dependency added' },
          409: { ...errorResponse, description: 'Would create a circular dependency' },
        },
      },
    },

    '/projects/{projectId}/sprints/{sprintId}/health': {
      get: {
        summary: 'Full predictive analysis for one sprint',
        description:
          'Returns the critical path, blocked work, scope creep against the frozen ' +
          'commitment baseline, estimation accuracy, and a Monte Carlo completion ' +
          'forecast. Cached for 30 seconds and invalidated immediately on any write ' +
          'to the project.',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'sprintId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Sprint health',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    health: {
                      type: 'object',
                      properties: {
                        riskLevel: {
                          type: 'string',
                          enum: ['on-track', 'caution', 'at-risk'],
                        },
                        reasons: { type: 'array', items: { type: 'string' } },
                      },
                    },
                    forecast: {
                      type: 'object',
                      properties: {
                        probabilityOnTime: { type: 'integer', nullable: true },
                        daysNeeded: {
                          type: 'object',
                          properties: {
                            p50: { type: 'integer' },
                            p85: { type: 'integer' },
                            p95: { type: 'integer' },
                          },
                        },
                        trials: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/projects/{projectId}/risks': {
      get: {
        summary: 'List risks ranked by exposure (probability x impact)',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Risks with a summary' } },
      },
      post: {
        summary: 'Log a risk',
        security: bearerAuth,
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'probability', 'impact'],
                properties: {
                  title: { type: 'string' },
                  category: {
                    type: 'string',
                    enum: ['technical', 'schedule', 'resource', 'external', 'quality'],
                  },
                  probability: { type: 'integer', minimum: 1, maximum: 5 },
                  impact: { type: 'integer', minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Risk logged' }, 400: errorResponse },
      },
    },
  },
};
