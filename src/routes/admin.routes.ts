import { Router } from 'express';
import { logout, renderLogin, submitLogin } from '../controllers/admin.controller';
import {
  renderAdminList,
  renderCreateForm,
  renderEditForm,
  submitCreate,
  submitDelete,
  submitEdit,
  submitMove,
  submitToggle,
  uploadImageApi,
} from '../controllers/adminStory.controller';
import { requireAdmin } from '../middlewares/adminAuth';
import { asyncHandler } from '../middlewares/errorHandler';
import { adminLoginLimiter } from '../middlewares/rateLimiter';
import { uploadEditorImageSafe, uploadMainImageSafe } from '../middlewares/upload';

export const adminRouter = Router();

// 로그인은 인증 없이 접근 가능해야 한다
adminRouter.get('/login', renderLogin);
adminRouter.post('/login', adminLoginLimiter, asyncHandler(submitLogin));
adminRouter.post('/logout', logout);

// 이 아래는 전부 로그인 필요
adminRouter.use(requireAdmin);

adminRouter.get('/story', asyncHandler(renderAdminList));
adminRouter.get('/story/new', renderCreateForm);
adminRouter.post('/story', uploadMainImageSafe, asyncHandler(submitCreate));
adminRouter.get('/story/:id/edit', asyncHandler(renderEditForm));
adminRouter.post('/story/:id', uploadMainImageSafe, asyncHandler(submitEdit));
adminRouter.post('/story/:id/delete', asyncHandler(submitDelete));
adminRouter.post('/story/:id/move/:direction', asyncHandler(submitMove));
adminRouter.post('/story/:id/toggle/:field', asyncHandler(submitToggle));

adminRouter.post('/upload/image', uploadEditorImageSafe, uploadImageApi);
