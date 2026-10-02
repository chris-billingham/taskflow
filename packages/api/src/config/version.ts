/**
 * The release this process runs. Release images bake TASKFLOW_VERSION and
 * TASKFLOW_COMMIT in at build time (see the Dockerfile); anything else, such
 * as a dev server or a source build, reports `dev`.
 */
export const RELEASE = {
  version: process.env.TASKFLOW_VERSION || 'dev',
  commit: process.env.TASKFLOW_COMMIT || null,
};
