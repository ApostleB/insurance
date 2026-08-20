import { Router } from 'express';
import {
  renderClaimComplete,
  renderClaimForm,
  renderConsultationComplete,
  renderConsultationForm,
  submitClaim,
  submitConsultation,
} from '../controllers/inquiry.controller';
import { healthCheck, renderHome, renderPrivacy } from '../controllers/page.controller';
import { robots, sitemap } from '../controllers/seo.controller';
import { renderStoryDetail, renderStoryList, slidesApi } from '../controllers/story.controller';
import { asyncHandler } from '../middlewares/errorHandler';
import { formSubmitLimiter } from '../middlewares/rateLimiter';

export const router = Router();

// 본인소개
router.get('/', renderHome);

// 설계신청
router.get('/consultation', renderConsultationForm);
router.post('/consultation', formSubmitLimiter, asyncHandler(submitConsultation));
router.get('/consultation/complete', renderConsultationComplete);

// 청구신청
router.get('/claim', renderClaimForm);
router.post('/claim', formSubmitLimiter, asyncHandler(submitClaim));
router.get('/claim/complete', renderClaimComplete);

// 이야기 (게시판)
router.get('/story', asyncHandler(renderStoryList));
router.get('/story/:id', asyncHandler(renderStoryDetail));
router.get('/api/story/slides', asyncHandler(slidesApi));

// 개인정보처리방침
router.get('/privacy', renderPrivacy);

// SEO
router.get('/sitemap.xml', sitemap);
router.get('/robots.txt', robots);

// 운영
router.get('/health', healthCheck);
