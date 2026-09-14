<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers/env.php';
require_once __DIR__ . '/helpers/uuid.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/router.php';
require_once __DIR__ . '/helpers/mappers.php';
require_once __DIR__ . '/helpers/totp.php';

require_once __DIR__ . '/repositories/Database.php';
require_once __DIR__ . '/repositories/UserRepository.php';
require_once __DIR__ . '/repositories/ProfileRepository.php';
require_once __DIR__ . '/repositories/SessionRepository.php';
require_once __DIR__ . '/repositories/OtpRepository.php';
require_once __DIR__ . '/repositories/SocialGraphRepository.php';
require_once __DIR__ . '/repositories/AudiencesRepository.php';
require_once __DIR__ . '/repositories/PostRepository.php';
require_once __DIR__ . '/repositories/EngagementRepository.php';
require_once __DIR__ . '/repositories/StoriesRepository.php';
require_once __DIR__ . '/repositories/ReelsRepository.php';
require_once __DIR__ . '/repositories/GroupsRepository.php';
require_once __DIR__ . '/repositories/EventsRepository.php';
require_once __DIR__ . '/repositories/MessagesRepository.php';
require_once __DIR__ . '/repositories/NotificationsRepository.php';
require_once __DIR__ . '/repositories/DiscoveryRepository.php';
require_once __DIR__ . '/repositories/SettingsRepository.php';
require_once __DIR__ . '/repositories/ReportsRepository.php';

require_once __DIR__ . '/services/JwtService.php';
require_once __DIR__ . '/services/MailService.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/AuthorizationService.php';
require_once __DIR__ . '/services/ProfileService.php';
require_once __DIR__ . '/services/SocialService.php';
require_once __DIR__ . '/services/AudiencesService.php';
require_once __DIR__ . '/services/PostService.php';
require_once __DIR__ . '/services/EngagementService.php';
require_once __DIR__ . '/services/MediaService.php';
require_once __DIR__ . '/services/StoriesService.php';
require_once __DIR__ . '/services/ReelsService.php';
require_once __DIR__ . '/services/GroupsService.php';
require_once __DIR__ . '/services/EventsService.php';
require_once __DIR__ . '/services/NotificationsService.php';
require_once __DIR__ . '/services/MessagesService.php';
require_once __DIR__ . '/services/DiscoveryService.php';
require_once __DIR__ . '/services/SettingsService.php';
require_once __DIR__ . '/services/SecurityService.php';
require_once __DIR__ . '/services/ReportsService.php';

require_once __DIR__ . '/middleware/CorsMiddleware.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/ProfileController.php';
require_once __DIR__ . '/controllers/SocialController.php';
require_once __DIR__ . '/controllers/AudiencesController.php';
require_once __DIR__ . '/controllers/PostController.php';
require_once __DIR__ . '/controllers/EngagementController.php';
require_once __DIR__ . '/controllers/MediaController.php';
require_once __DIR__ . '/controllers/StoriesController.php';
require_once __DIR__ . '/controllers/ReelsController.php';
require_once __DIR__ . '/controllers/GroupsController.php';
require_once __DIR__ . '/controllers/EventsController.php';
require_once __DIR__ . '/controllers/MessagesController.php';
require_once __DIR__ . '/controllers/NotificationsController.php';
require_once __DIR__ . '/controllers/DiscoveryController.php';
require_once __DIR__ . '/controllers/SettingsController.php';
require_once __DIR__ . '/controllers/SecurityController.php';
require_once __DIR__ . '/controllers/ReportsController.php';

viora_load_env(__DIR__ . '/.env');

$appConfig = require __DIR__ . '/config/app.php';
$jwtConfig = require __DIR__ . '/config/jwt.php';
$mailConfig = require __DIR__ . '/config/mail.php';

$db = Database::connection();
$jwt = new JwtService($jwtConfig);
$mail = new MailService($mailConfig, $appConfig);

$userRepo = new UserRepository($db);
$profileRepo = new ProfileRepository($db);
$sessionRepo = new SessionRepository($db);
$otpRepo = new OtpRepository($db);
$graphRepo = new SocialGraphRepository($db);
$audiencesRepo = new AudiencesRepository($db);
$postRepo = new PostRepository($db);
$engagementRepo = new EngagementRepository($db);
$storiesRepo = new StoriesRepository($db);
$reelsRepo = new ReelsRepository($db);
$groupsRepo = new GroupsRepository($db);
$eventsRepo = new EventsRepository($db);
$messagesRepo = new MessagesRepository($db);
$notificationsRepo = new NotificationsRepository($db);
$discoveryRepo = new DiscoveryRepository($db);
$settingsRepo = new SettingsRepository($db);
$reportsRepo = new ReportsRepository($db);

$authz = new AuthorizationService($db);
$authService = new AuthService($userRepo, $profileRepo, $sessionRepo, $otpRepo, $jwt, $mail, $mailConfig);
$profileService = new ProfileService($profileRepo, $authz);
$socialService = new SocialService($profileRepo, $graphRepo, $authz);
$audiencesService = new AudiencesService($audiencesRepo, $profileRepo);
$postService = new PostService($postRepo, $profileRepo, $graphRepo, $authz);
$engagementService = new EngagementService($postRepo, $engagementRepo, $profileRepo, $authz, $postService);
$mediaService = new MediaService($appConfig);
$storiesService = new StoriesService($storiesRepo, $profileRepo, $authz);
$reelsService = new ReelsService($reelsRepo, $profileRepo, $authz);
$groupsService = new GroupsService($groupsRepo, $profileRepo, $postService, $authz);
$eventsService = new EventsService($eventsRepo, $profileRepo, $postService);
$notificationsService = new NotificationsService($notificationsRepo, $profileRepo, $authz);
$messagesService = new MessagesService($messagesRepo, $profileRepo, $authz, $notificationsService);
$discoveryService = new DiscoveryService($discoveryRepo, $postService, $profileRepo);
$settingsService = new SettingsService($settingsRepo, $profileRepo, $userRepo, $notificationsService);
$securityService = new SecurityService($userRepo);
$reportsService = new ReportsService($reportsRepo, $settingsRepo);

$authMiddleware = new AuthMiddleware($jwt);

return [
    'app' => $appConfig,
    'authMiddleware' => $authMiddleware,
    'authController' => new AuthController($authService),
    'profileController' => new ProfileController($profileService),
    'socialController' => new SocialController($socialService),
    'audiencesController' => new AudiencesController($audiencesService),
    'postController' => new PostController($postService, $engagementService),
    'engagementController' => new EngagementController($engagementService),
    'mediaController' => new MediaController($mediaService, $profileRepo),
    'storiesController' => new StoriesController($storiesService),
    'reelsController' => new ReelsController($reelsService),
    'groupsController' => new GroupsController($groupsService),
    'eventsController' => new EventsController($eventsService),
    'messagesController' => new MessagesController($messagesService),
    'notificationsController' => new NotificationsController($notificationsService),
    'discoveryController' => new DiscoveryController($discoveryService),
    'settingsController' => new SettingsController($settingsService),
    'securityController' => new SecurityController($securityService),
    'reportsController' => new ReportsController($reportsService),
];
