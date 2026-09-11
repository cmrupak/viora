import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnlyRoute, ProtectedRoute } from './auth/guards';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SetupPage } from './pages/SetupPage';
import { FeedPage } from './pages/FeedPage';
import { CreatePostPage } from './pages/CreatePostPage';
import { ExplorePage } from './pages/ExplorePage';
import { HashtagPage } from './pages/HashtagPage';
import { PlacePage } from './pages/PlacePage';
import { MessagesPage } from './pages/MessagesPage';
import { ConversationPage } from './pages/ConversationPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { UserProfilePage } from './pages/UserProfilePage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { AudienceListsPage } from './pages/AudienceListsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { SavedPage } from './pages/SavedPage';
import { FriendsPage } from './pages/FriendsPage';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { ReelsPage } from './pages/ReelsPage';
import { ReelsCreatePage } from './pages/ReelsCreatePage';
import { WatchPage } from './pages/WatchPage';
import { HighlightsPage } from './pages/HighlightsPage';
import { SearchPage } from './pages/SearchPage';
import { StoriesCreatePage } from './pages/StoriesCreatePage';
import { DownloadAppPage } from './pages/DownloadAppPage';

export function App() {
  return (
    <Routes>
      <Route path="/app" element={<DownloadAppPage />} />
      <Route path="/setup" element={<SetupPage />} />

      <Route element={<GuestOnlyRoute />}>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/home" element={<FeedPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/hashtags/:tag" element={<HashtagPage />} />
          <Route path="/places/:name" element={<PlacePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/reels" element={<ReelsPage />} />
          <Route path="/reels/create" element={<ReelsCreatePage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/highlights" element={<HighlightsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/stories/create" element={<StoriesCreatePage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:id" element={<ConversationPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/create" element={<CreatePostPage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route path="/u/:username" element={<UserProfilePage />} />
          <Route path="/u/:username/connections" element={<ConnectionsPage />} />
          <Route path="/audience-lists" element={<AudienceListsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
