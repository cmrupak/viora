<?php

declare(strict_types=1);

/**
 * @var array $container
 * @var AuthController $authController
 * @var AuthMiddleware $authMiddleware
 * @var ProfileController $profileController
 * @var SocialController $socialController
 * @var AudiencesController $audiencesController
 * @var PostController $postController
 * @var EngagementController $engagementController
 * @var MediaController $mediaController
 * @var StoriesController $storiesController
 * @var ReelsController $reelsController
 * @var GroupsController $groupsController
 * @var EventsController $eventsController
 * @var MessagesController $messagesController
 * @var NotificationsController $notificationsController
 * @var DiscoveryController $discoveryController
 * @var SettingsController $settingsController
 * @var SecurityController $securityController
 * @var ReportsController $reportsController
 */

$authController = $container['authController'];
$authMiddleware = $container['authMiddleware'];
$profileController = $container['profileController'];
$socialController = $container['socialController'];
$audiencesController = $container['audiencesController'];
$postController = $container['postController'];
$engagementController = $container['engagementController'];
$mediaController = $container['mediaController'];
$storiesController = $container['storiesController'];
$reelsController = $container['reelsController'];
$groupsController = $container['groupsController'];
$eventsController = $container['eventsController'];
$messagesController = $container['messagesController'];
$notificationsController = $container['notificationsController'];
$discoveryController = $container['discoveryController'];
$settingsController = $container['settingsController'];
$securityController = $container['securityController'];
$reportsController = $container['reportsController'];

return [
    ['GET', '/api/v1/health', static function () use ($container): void {
        viora_json_response([
            'ok' => true,
            'service' => 'viora-api',
            'env' => $container['app']['env'] ?? 'local',
            'phase' => 7,
        ]);
    }],

    // Auth
    ['POST', '/api/v1/auth/register', static fn () => $authController->register()],
    ['POST', '/api/v1/auth/login', static fn () => $authController->login()],
    ['POST', '/api/v1/auth/refresh', static fn () => $authController->refresh()],
    ['POST', '/api/v1/auth/logout', static fn () => $authController->logout($authMiddleware->optionalUser())],
    ['GET', '/api/v1/auth/me', static fn () => $authController->me($authMiddleware->requireUser())],
    ['POST', '/api/v1/auth/password/otp', static fn () => $authController->passwordOtp()],
    ['POST', '/api/v1/auth/password/otp/send', static fn () => $authController->passwordOtpSend()],
    ['POST', '/api/v1/auth/password/otp/reset', static fn () => $authController->passwordOtpReset()],

    // Profiles
    ['GET', '/api/v1/profile', static fn () => $profileController->me($authMiddleware->requireUser())],
    ['PATCH', '/api/v1/profile', static fn () => $profileController->updateMe($authMiddleware->requireUser())],
    ['GET', '/api/v1/users/search', static fn () => $profileController->search()],
    ['GET', '/api/v1/users/suggestions', static fn () => $socialController->listSuggestions($authMiddleware->requireUser())],
    ['GET', '/api/v1/users/{username}', static fn ($p) => $profileController->getByUsername($p)],
    ['GET', '/api/v1/users/id/{userId}', static fn ($p) => $profileController->getById($p)],

    // Social graph
    ['POST', '/api/v1/users/{userId}/follow', static fn ($p) => $socialController->toggleFollow($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/users/{userId}/followers', static fn ($p) => $socialController->listFollowers($p)],
    ['GET', '/api/v1/users/{userId}/following', static fn ($p) => $socialController->listFollowing($p)],
    ['GET', '/api/v1/follow-requests', static fn () => $socialController->listFollowRequests($authMiddleware->requireUser())],
    ['POST', '/api/v1/follow-requests/{requestId}/accept', static fn ($p) => $socialController->acceptFollowRequest($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/follow-requests/{requestId}/reject', static fn ($p) => $socialController->rejectFollowRequest($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/follow-requests/{requestId}', static fn ($p) => $socialController->cancelFollowRequest($authMiddleware->requireUser(), $p)],

    ['POST', '/api/v1/users/{userId}/friend-request', static fn ($p) => $socialController->sendFriendRequest($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/friend-requests/{requestId}/accept', static fn ($p) => $socialController->acceptFriendRequest($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/friend-requests/{requestId}/reject', static fn ($p) => $socialController->rejectFriendRequest($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/friend-requests/{requestId}', static fn ($p) => $socialController->cancelFriendRequest($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/users/{userId}/friend', static fn ($p) => $socialController->removeFriend($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/users/{userId}/friends', static fn ($p) => $socialController->listFriends($p)],
    ['GET', '/api/v1/friend-requests', static fn () => $socialController->listFriendRequests($authMiddleware->requireUser())],
    ['GET', '/api/v1/users/{userId}/relationship', static fn ($p) => $socialController->relationship($authMiddleware->requireUser(), $p)],

    ['POST', '/api/v1/users/{userId}/mute', static fn ($p) => $socialController->setMute($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/users/{userId}/mute', static fn ($p) => $socialController->unmute($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/users/{userId}/restrict', static fn ($p) => $socialController->toggleRestrict($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/users/{userId}/snooze', static fn ($p) => $socialController->snooze($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/users/{userId}/snooze', static fn ($p) => $socialController->unsnooze($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/users/{userId}/close-friend', static fn ($p) => $socialController->toggleCloseFriend($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/users/{userId}/favorite', static fn ($p) => $socialController->toggleFavorite($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/users/{userId}/block', static fn ($p) => $socialController->block($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/users/{userId}/block', static fn ($p) => $socialController->unblock($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/users/{userId}/followers/{followerId}', static fn ($p) => $socialController->removeFollower($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/users/{userId}/mutual-friends', static fn ($p) => $socialController->listMutualFriends($authMiddleware->requireUser(), $p)],

    ['GET', '/api/v1/blocks', static fn () => $socialController->listBlocked($authMiddleware->requireUser())],
    ['GET', '/api/v1/mutes', static fn () => $socialController->listMutes($authMiddleware->requireUser())],
    ['GET', '/api/v1/restricts', static fn () => $socialController->listRestricts($authMiddleware->requireUser())],
    ['GET', '/api/v1/snoozes', static fn () => $socialController->listSnoozes($authMiddleware->requireUser())],
    ['GET', '/api/v1/close-friends', static fn () => $socialController->listCloseFriends($authMiddleware->requireUser())],
    ['GET', '/api/v1/favorites', static fn () => $socialController->listFavorites($authMiddleware->requireUser())],

    // Audiences
    ['GET', '/api/v1/audiences', static fn () => $audiencesController->list($authMiddleware->requireUser())],
    ['POST', '/api/v1/audiences', static fn () => $audiencesController->create($authMiddleware->requireUser())],
    ['PATCH', '/api/v1/audiences/{listId}', static fn ($p) => $audiencesController->rename($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/audiences/{listId}', static fn ($p) => $audiencesController->delete($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/audiences/{listId}/members', static fn ($p) => $audiencesController->listMembers($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/audiences/{listId}/members', static fn ($p) => $audiencesController->addMember($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/audiences/{listId}/members/{memberId}', static fn ($p) => $audiencesController->removeMember($authMiddleware->requireUser(), $p)],

    // Posts / engagement
    ['GET', '/api/v1/feed', static fn () => $postController->feed($authMiddleware->requireUser())],
    ['GET', '/api/v1/watch', static fn () => $postController->watchFeed($authMiddleware->requireUser())],
    ['POST', '/api/v1/posts', static fn () => $postController->create($authMiddleware->requireUser())],
    ['GET', '/api/v1/posts/drafts', static fn () => $postController->listDrafts($authMiddleware->requireUser())],
    ['GET', '/api/v1/posts/{postId}', static fn ($p) => $postController->get($authMiddleware->optionalUser() ?? [], $p)],
    ['PATCH', '/api/v1/posts/{postId}', static fn ($p) => $postController->update($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/posts/{postId}', static fn ($p) => $postController->delete($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/posts/{postId}/revisions', static fn ($p) => $postController->listRevisions($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/users/{userId}/posts', static fn ($p) => $postController->listByUser($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/posts/{postId}/hide', static fn ($p) => $postController->hide($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/posts/{postId}/hide', static fn ($p) => $postController->unhide($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/pin', static fn ($p) => $postController->pin($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/archive', static fn ($p) => $postController->archive($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/view', static fn ($p) => $postController->recordView($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/comments-disabled', static fn ($p) => $postController->commentsDisabled($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/like', static fn ($p) => $postController->toggleLike($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/save', static fn ($p) => $engagementController->toggleSave($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/posts/{postId}/reactions', static fn ($p) => $engagementController->getReactions($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/posts/{postId}/reactions', static fn ($p) => $engagementController->setReaction($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/posts/{postId}/share', static fn ($p) => $engagementController->createShare($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/posts/{postId}/comments', static fn ($p) => $postController->listComments($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/posts/{postId}/comments', static fn ($p) => $postController->createComment($authMiddleware->requireUser(), $p)],
    ['PATCH', '/api/v1/comments/{commentId}', static fn ($p) => $postController->updateComment($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/comments/{commentId}', static fn ($p) => $postController->deleteComment($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/comments/{commentId}/like', static fn ($p) => $postController->toggleCommentLike($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/comments/{commentId}/pin', static fn ($p) => $engagementController->pinComment($authMiddleware->requireUser(), $p)],

    ['GET', '/api/v1/saved', static fn () => $engagementController->listSaved($authMiddleware->requireUser())],
    ['POST', '/api/v1/saved/move', static fn () => $engagementController->moveSaved($authMiddleware->requireUser())],
    ['GET', '/api/v1/saved/collections', static fn () => $engagementController->listCollections($authMiddleware->requireUser())],
    ['POST', '/api/v1/saved/collections', static fn () => $engagementController->createCollection($authMiddleware->requireUser())],
    ['PATCH', '/api/v1/saved/collections/{collectionId}', static fn ($p) => $engagementController->renameCollection($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/saved/collections/{collectionId}', static fn ($p) => $engagementController->deleteCollection($authMiddleware->requireUser(), $p)],

    ['GET', '/api/v1/comment-filters', static fn () => $engagementController->listKeywordFilters($authMiddleware->requireUser())],
    ['POST', '/api/v1/comment-filters', static fn () => $engagementController->addKeywordFilter($authMiddleware->requireUser())],
    ['DELETE', '/api/v1/comment-filters', static fn () => $engagementController->removeKeywordFilter($authMiddleware->requireUser())],

    ['GET', '/api/v1/post-tags/pending', static fn () => $postController->listPendingTags($authMiddleware->requireUser())],
    ['POST', '/api/v1/post-tags/{tagId}/respond', static fn ($p) => $postController->respondToTag($authMiddleware->requireUser(), $p)],

    ['POST', '/api/v1/media/upload', static fn () => $mediaController->upload($authMiddleware->requireUser())],

    // Stories
    ['GET', '/api/v1/stories', static fn () => $storiesController->list($authMiddleware->optionalUser() ?? [])],
    ['POST', '/api/v1/stories', static fn () => $storiesController->create($authMiddleware->requireUser())],
    ['GET', '/api/v1/stories/{storyId}', static fn ($p) => $storiesController->get($authMiddleware->optionalUser() ?? [], $p)],
    ['DELETE', '/api/v1/stories/{storyId}', static fn ($p) => $storiesController->delete($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/stories/{storyId}/view', static fn ($p) => $storiesController->view($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/stories/{storyId}/viewers', static fn ($p) => $storiesController->viewers($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/stories/stickers/respond', static fn () => $storiesController->stickerRespond($authMiddleware->requireUser())],
    ['POST', '/api/v1/highlights', static fn () => $storiesController->createHighlight($authMiddleware->requireUser())],
    ['GET', '/api/v1/users/{userId}/highlights', static fn ($p) => $storiesController->listHighlights($p)],
    ['DELETE', '/api/v1/highlights/{highlightId}', static fn ($p) => $storiesController->deleteHighlight($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/highlights/{highlightId}/items', static fn ($p) => $storiesController->addStoryToHighlight($authMiddleware->requireUser(), $p)],

    // Reels
    ['GET', '/api/v1/reels', static fn () => $reelsController->feed($authMiddleware->optionalUser() ?? [])],
    ['POST', '/api/v1/reels', static fn () => $reelsController->create($authMiddleware->requireUser())],
    ['GET', '/api/v1/reels/{reelId}', static fn ($p) => $reelsController->get($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/reels/{reelId}/like', static fn ($p) => $reelsController->like($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/reels/{reelId}/save', static fn ($p) => $reelsController->save($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/reels/{reelId}/view', static fn ($p) => $reelsController->view($p)],
    ['GET', '/api/v1/reels/{reelId}/comments', static fn ($p) => $reelsController->listComments($p)],
    ['POST', '/api/v1/reels/{reelId}/comments', static fn ($p) => $reelsController->createComment($authMiddleware->requireUser(), $p)],

    // Groups
    ['GET', '/api/v1/groups', static fn () => $groupsController->list($authMiddleware->optionalUser() ?? [])],
    ['POST', '/api/v1/groups', static fn () => $groupsController->create($authMiddleware->requireUser())],
    ['GET', '/api/v1/groups/{groupId}', static fn ($p) => $groupsController->get($authMiddleware->optionalUser() ?? [], $p)],
    ['PATCH', '/api/v1/groups/{groupId}', static fn ($p) => $groupsController->update($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/groups/{groupId}/join', static fn ($p) => $groupsController->join($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/groups/{groupId}/leave', static fn ($p) => $groupsController->leave($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/groups/{groupId}/members', static fn ($p) => $groupsController->listMembers($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/groups/{groupId}/members/{userId}/approve', static fn ($p) => $groupsController->approveMember($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/groups/{groupId}/members/{userId}/reject', static fn ($p) => $groupsController->rejectMember($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/groups/{groupId}/members/{userId}/role', static fn ($p) => $groupsController->setRole($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/groups/{groupId}/posts', static fn ($p) => $groupsController->listPosts($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/groups/{groupId}/posts', static fn ($p) => $groupsController->createPost($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/groups/{groupId}/posts/{postId}/approval', static fn ($p) => $groupsController->setPostApproval($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/groups/{groupId}/join-questions', static fn ($p) => $groupsController->listQuestions($p)],
    ['POST', '/api/v1/groups/{groupId}/join-questions', static fn ($p) => $groupsController->addQuestion($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/groups/{groupId}/join-questions/{questionId}', static fn ($p) => $groupsController->deleteQuestion($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/groups/{groupId}/channels', static fn ($p) => $groupsController->listChannels($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/groups/{groupId}/channels', static fn ($p) => $groupsController->createChannel($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/channels/{channelId}/messages', static fn ($p) => $groupsController->listBroadcast($authMiddleware->optionalUser() ?? [], $p)],
    ['POST', '/api/v1/channels/{channelId}/messages', static fn ($p) => $groupsController->postBroadcast($authMiddleware->requireUser(), $p)],

    // Events
    ['GET', '/api/v1/events', static fn () => $eventsController->list($authMiddleware->optionalUser() ?? [])],
    ['POST', '/api/v1/events', static fn () => $eventsController->create($authMiddleware->requireUser())],
    ['GET', '/api/v1/events/{eventId}', static fn ($p) => $eventsController->get($authMiddleware->optionalUser() ?? [], $p)],
    ['DELETE', '/api/v1/events/{eventId}', static fn ($p) => $eventsController->delete($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/events/{eventId}/rsvp', static fn ($p) => $eventsController->rsvp($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/events/{eventId}/rsvp', static fn ($p) => $eventsController->leave($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/events/{eventId}/members', static fn ($p) => $eventsController->listMembers($p)],
    ['POST', '/api/v1/events/{eventId}/invites', static fn ($p) => $eventsController->invite($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/event-invites', static fn () => $eventsController->myInvites($authMiddleware->requireUser())],
    ['POST', '/api/v1/event-invites/{inviteId}/respond', static fn ($p) => $eventsController->respondInvite($authMiddleware->requireUser(), $p)],

    // Messaging
    ['GET', '/api/v1/conversations', static fn () => $messagesController->listConversations($authMiddleware->requireUser())],
    ['GET', '/api/v1/conversations/requests', static fn () => $messagesController->listRequests($authMiddleware->requireUser())],
    ['POST', '/api/v1/conversations/dm', static fn () => $messagesController->createDm($authMiddleware->requireUser())],
    ['POST', '/api/v1/conversations/groups', static fn () => $messagesController->createGroup($authMiddleware->requireUser())],
    ['POST', '/api/v1/conversations/{conversationId}/accept', static fn ($p) => $messagesController->accept($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/conversations/{conversationId}/decline', static fn ($p) => $messagesController->decline($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/conversations/{conversationId}/messages', static fn ($p) => $messagesController->listMessages($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/conversations/{conversationId}/messages', static fn ($p) => $messagesController->send($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/conversations/{conversationId}/read', static fn ($p) => $messagesController->markRead($authMiddleware->requireUser(), $p)],
    ['PATCH', '/api/v1/conversations/{conversationId}/prefs', static fn ($p) => $messagesController->prefs($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/messages/{messageId}/reactions', static fn ($p) => $messagesController->react($authMiddleware->requireUser(), $p)],
    ['DELETE', '/api/v1/messages/{messageId}', static fn ($p) => $messagesController->deleteMessage($authMiddleware->requireUser(), $p)],
    ['GET', '/api/v1/messages/search', static fn () => $messagesController->search($authMiddleware->requireUser())],
    ['POST', '/api/v1/presence/heartbeat', static fn () => $messagesController->heartbeat($authMiddleware->requireUser())],
    ['GET', '/api/v1/presence', static fn () => $messagesController->presence($authMiddleware->requireUser())],
    ['POST', '/api/v1/presence', static fn () => $messagesController->presence($authMiddleware->requireUser())],

    // Notifications
    ['GET', '/api/v1/notification-prefs', static fn () => $notificationsController->getPrefs($authMiddleware->requireUser())],
    ['PATCH', '/api/v1/notification-prefs', static fn () => $notificationsController->updatePrefs($authMiddleware->requireUser())],
    ['POST', '/api/v1/push-tokens', static fn () => $notificationsController->registerToken($authMiddleware->requireUser())],
    ['DELETE', '/api/v1/push-tokens', static fn () => $notificationsController->removeToken($authMiddleware->requireUser())],
    ['GET', '/api/v1/notifications', static fn () => $notificationsController->list($authMiddleware->requireUser())],
    ['POST', '/api/v1/notifications/{notificationId}/read', static fn ($p) => $notificationsController->markRead($authMiddleware->requireUser(), $p)],
    ['POST', '/api/v1/notifications/read-all', static fn () => $notificationsController->markAllRead($authMiddleware->requireUser())],
    ['GET', '/api/v1/notifications/unread-count', static fn () => $notificationsController->unreadCount($authMiddleware->requireUser())],

    // Discovery
    ['GET', '/api/v1/hashtags/trending', static fn () => $discoveryController->trendingHashtags()],
    ['GET', '/api/v1/hashtags/{tag}', static fn ($p) => $discoveryController->getHashtag($p)],
    ['GET', '/api/v1/hashtags/{tag}/posts', static fn ($p) => $discoveryController->hashtagPosts($authMiddleware->optionalUser() ?? [], $p)],
    ['GET', '/api/v1/explore', static fn () => $discoveryController->explore($authMiddleware->optionalUser() ?? [])],
    ['GET', '/api/v1/places/search', static fn () => $discoveryController->searchPlaces()],
    ['GET', '/api/v1/places/{locationName}/posts', static fn ($p) => $discoveryController->placePosts($authMiddleware->optionalUser() ?? [], $p)],
    ['GET', '/api/v1/birthdays/today', static fn () => $discoveryController->birthdays()],
    ['GET', '/api/v1/memories', static fn () => $discoveryController->memories($authMiddleware->requireUser())],

    // Settings / safety
    ['GET', '/api/v1/settings', static fn () => $settingsController->get($authMiddleware->requireUser())],
    ['PATCH', '/api/v1/settings', static fn () => $settingsController->update($authMiddleware->requireUser())],
    ['GET', '/api/v1/settings/activity', static fn () => $settingsController->activity($authMiddleware->requireUser())],
    ['GET', '/api/v1/settings/login-events', static fn () => $settingsController->loginEvents($authMiddleware->requireUser())],
    ['POST', '/api/v1/settings/login-events', static fn () => $settingsController->recordLoginEvent($authMiddleware->requireUser())],
    ['GET', '/api/v1/settings/exports', static fn () => $settingsController->listExports($authMiddleware->requireUser())],
    ['POST', '/api/v1/settings/exports', static fn () => $settingsController->requestExport($authMiddleware->requireUser())],
    ['GET', '/api/v1/settings/exports/download', static fn () => $settingsController->downloadExport($authMiddleware->requireUser())],
    ['GET', '/api/v1/settings/deletion-requests', static fn () => $settingsController->listDeletions($authMiddleware->requireUser())],
    ['POST', '/api/v1/settings/deletion-requests', static fn () => $settingsController->requestDeletion($authMiddleware->requireUser())],
    ['POST', '/api/v1/settings/deactivate', static fn () => $settingsController->deactivate($authMiddleware->requireUser())],
    ['POST', '/api/v1/settings/reactivate', static fn () => $settingsController->reactivate($authMiddleware->requireUser())],
    ['POST', '/api/v1/account-export', static fn () => $settingsController->runExport($authMiddleware->requireUser())],
    ['POST', '/api/v1/account-delete', static fn () => $settingsController->runDelete($authMiddleware->requireUser())],

    // MFA / security
    ['GET', '/api/v1/security/mfa/factors', static fn () => $securityController->listFactors($authMiddleware->requireUser())],
    ['POST', '/api/v1/security/mfa/enroll', static fn () => $securityController->enrollTotp($authMiddleware->requireUser())],
    ['POST', '/api/v1/security/mfa/verify', static fn () => $securityController->challengeAndVerify($authMiddleware->requireUser())],
    ['POST', '/api/v1/security/mfa/unenroll', static fn () => $securityController->unenroll($authMiddleware->requireUser())],
    ['GET', '/api/v1/security/mfa/aal', static fn () => $securityController->aal($authMiddleware->requireUser())],

    // Reports
    ['POST', '/api/v1/reports', static fn () => $reportsController->create($authMiddleware->requireUser())],
];
