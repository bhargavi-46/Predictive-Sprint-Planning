import { Router } from 'express';
import { requireAuth, requireProjectMember, requireProjectOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as S from '../schemas/index.js';
import * as auth from '../controllers/authController.js';
import * as projects from '../controllers/projectController.js';
import * as sprints from '../controllers/sprintController.js';
import * as tasks from '../controllers/taskController.js';
import * as analytics from '../controllers/analyticsController.js';
import * as risks from '../controllers/riskController.js';
import * as deps from '../controllers/dependencyController.js';
import * as comments from '../controllers/commentController.js';
import * as activity from '../controllers/activityController.js';
import { cacheStats } from '../services/cache.js';
import { openapiDocument } from '../docs/openapi.js';

const router = Router();

/**
 * Machine-readable API contract, plus a zero-dependency viewer.
 *
 * The HTML page is served rather than bundling swagger-ui-express so the API
 * process carries no extra runtime dependency for something only developers
 * open; the spec itself is the artefact that matters.
 */
router.get('/openapi.json', (_req, res) => res.json(openapiDocument));

router.get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Predictive Sprint Planning API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#ui' });
    </script>
  </body>
</html>`);
});

/**
 * Liveness/readiness probe. Reports cache effectiveness and memory so the
 * running process can be inspected without shell access.
 */
router.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    cache: cacheStats(),
    memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  })
);

// ---------------------------------------------------------------- auth
router.post('/auth/register', validate({ body: S.registerBody }), auth.register);
router.post('/auth/login', validate({ body: S.loginBody }), auth.login);
router.get('/auth/me', requireAuth, auth.me);
router.get('/users/search', requireAuth, auth.searchUsers);

// ------------------------------------------------------------ projects
router.route('/projects')
  .get(requireAuth, projects.listProjects)
  .post(requireAuth, validate({ body: S.createProjectBody }), projects.createProject);

router.route('/projects/:projectId')
  .get(requireAuth, validate({ params: S.projectParams }), requireProjectMember, projects.getProject)
  .patch(
    requireAuth,
    validate({ params: S.projectParams, body: S.updateProjectBody }),
    requireProjectMember, requireProjectOwner, projects.updateProject
  )
  .delete(
    requireAuth, validate({ params: S.projectParams }),
    requireProjectMember, requireProjectOwner, projects.deleteProject
  );

router.post(
  '/projects/:projectId/members',
  requireAuth, validate({ params: S.projectParams }),
  requireProjectMember, requireProjectOwner, projects.addMember
);
router.delete(
  '/projects/:projectId/members/:userId',
  requireAuth, validate({ params: S.memberParams }),
  requireProjectMember, requireProjectOwner, projects.removeMember
);

// ------------------------------------------------------------- sprints
router.route('/projects/:projectId/sprints')
  .get(requireAuth, validate({ params: S.projectParams }), requireProjectMember, sprints.listSprints)
  .post(
    requireAuth, validate({ params: S.projectParams, body: S.createSprintBody }),
    requireProjectMember, sprints.createSprint
  );

router.route('/projects/:projectId/sprints/:sprintId')
  .patch(
    requireAuth, validate({ params: S.sprintParams, body: S.updateSprintBody }),
    requireProjectMember, sprints.updateSprint
  )
  .delete(
    requireAuth, validate({ params: S.sprintParams }),
    requireProjectMember, sprints.deleteSprint
  );

router.get(
  '/projects/:projectId/sprints/:sprintId/burndown',
  requireAuth, validate({ params: S.sprintParams }), requireProjectMember, sprints.getBurndown
);

// --------------------------------------------------------------- tasks
router.route('/projects/:projectId/tasks')
  .get(
    requireAuth, validate({ params: S.projectParams, query: S.listTasksQuery }),
    requireProjectMember, tasks.listTasks
  )
  .post(
    requireAuth, validate({ params: S.projectParams, body: S.createTaskBody }),
    requireProjectMember, tasks.createTask
  );

router.route('/projects/:projectId/tasks/:taskId')
  .get(requireAuth, validate({ params: S.taskParams }), requireProjectMember, tasks.getTask)
  .patch(
    requireAuth, validate({ params: S.taskParams, body: S.updateTaskBody }),
    requireProjectMember, tasks.updateTask
  )
  .delete(requireAuth, validate({ params: S.taskParams }), requireProjectMember, tasks.deleteTask);

router.patch(
  '/projects/:projectId/tasks/:taskId/move',
  requireAuth, validate({ params: S.taskParams, body: S.moveTaskBody }),
  requireProjectMember, tasks.moveTask
);

// -------------------------------------------------------- dependencies
router.post(
  '/projects/:projectId/tasks/:taskId/dependencies',
  requireAuth, validate({ params: S.taskParams, body: S.addDependencyBody }),
  requireProjectMember, deps.addDependency
);
router.delete(
  '/projects/:projectId/tasks/:taskId/dependencies/:dependencyId',
  requireAuth, validate({ params: S.dependencyParams }),
  requireProjectMember, deps.removeDependency
);
router.get(
  '/projects/:projectId/dependency-graph',
  requireAuth, validate({ params: S.projectParams }), requireProjectMember, deps.getDependencyGraph
);

// ----------------------------------------------- predictive analytics
router.get(
  '/projects/:projectId/sprints/:sprintId/critical-path',
  requireAuth, validate({ params: S.sprintParams }), requireProjectMember, analytics.getCriticalPath
);
router.get(
  '/projects/:projectId/sprints/:sprintId/forecast',
  requireAuth, validate({ params: S.sprintParams }), requireProjectMember, analytics.getForecast
);
router.get(
  '/projects/:projectId/sprints/:sprintId/scope-creep',
  requireAuth, validate({ params: S.sprintParams }), requireProjectMember, analytics.getScopeCreep
);
router.get(
  '/projects/:projectId/sprints/:sprintId/health',
  requireAuth, validate({ params: S.sprintParams }), requireProjectMember, analytics.getSprintHealth
);
router.get(
  '/projects/:projectId/estimation-accuracy',
  requireAuth, validate({ params: S.projectParams }),
  requireProjectMember, analytics.getEstimationAccuracy
);

// ------------------------------------------------------------ comments
router.route('/projects/:projectId/tasks/:taskId/comments')
  .get(requireAuth, validate({ params: S.taskParams }), requireProjectMember, comments.listComments)
  .post(
    requireAuth, validate({ params: S.taskParams, body: S.commentBody }),
    requireProjectMember, comments.createComment
  );

router.route('/projects/:projectId/tasks/:taskId/comments/:commentId')
  .patch(
    requireAuth, validate({ params: S.commentParams, body: S.commentBody }),
    requireProjectMember, comments.updateComment
  )
  .delete(
    requireAuth, validate({ params: S.commentParams }),
    requireProjectMember, comments.deleteComment
  );

// ------------------------------------------------------ activity / audit
router.get(
  '/projects/:projectId/activity',
  requireAuth, validate({ params: S.projectParams, query: S.listActivityQuery }),
  requireProjectMember, activity.listActivity
);
router.get(
  '/projects/:projectId/tasks/:taskId/activity',
  requireAuth, validate({ params: S.taskParams }),
  requireProjectMember, activity.listTaskActivity
);

// -------------------------------------------------------- team workload
router.get(
  '/projects/:projectId/sprints/:sprintId/workload',
  requireAuth, validate({ params: S.sprintParams }),
  requireProjectMember, analytics.getTeamWorkload
);

// ------------------------------------------------------- risk register
router.route('/projects/:projectId/risks')
  .get(requireAuth, validate({ params: S.projectParams }), requireProjectMember, risks.listRisks)
  .post(
    requireAuth, validate({ params: S.projectParams, body: S.createRiskBody }),
    requireProjectMember, risks.createRisk
  );

router.route('/projects/:projectId/risks/:riskId')
  .patch(
    requireAuth, validate({ params: S.riskParams, body: S.updateRiskBody }),
    requireProjectMember, risks.updateRisk
  )
  .delete(
    requireAuth, validate({ params: S.riskParams }), requireProjectMember, risks.deleteRisk
  );

export default router;
