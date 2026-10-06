import React, { useState } from 'react';
import { 
  Trophy, 
  Flame, 
  Sparkles, 
  UserPlus, 
  CheckCircle2, 
  Send, 
  Crown, 
  Medal, 
  Target, 
  Play,
  Heart,
  Users
} from 'lucide-react';
import { FriendUser, QuranChallenge } from '../types/quran';
import { saveFriends, saveChallenges } from '../services/storageService';

interface CompetitionLeaderboardProps {
  friends: FriendUser[];
  challenges: QuranChallenge[];
  onStartChallenge: (challenge: QuranChallenge) => void;
  onRefresh: () => void;
}

export const CompetitionLeaderboard: React.FC<CompetitionLeaderboardProps> = ({
  friends,
  challenges,
  onStartChallenge,
  onRefresh
}) => {
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendNameInput, setFriendNameInput] = useState('');
  const [sentCheers, setSentCheers] = useState<Record<string, string>>({});

  // Sort by points descending
  const sortedFriends = [...friends].sort((a, b) => b.points - a.points).map((f, idx) => ({
    ...f,
    rank: idx + 1
  }));

  const handleSendCheer = (friendId: string, cheerText: string) => {
    setSentCheers(prev => ({ ...prev, [friendId]: cheerText }));
    setTimeout(() => {
      setSentCheers(prev => {
        const next = { ...prev };
        delete next[friendId];
        return next;
      });
    }, 4000);
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendNameInput.trim()) return;

    const newFriend: FriendUser = {
      id: `friend_${Date.now()}`,
      name: friendNameInput.trim(),
      avatar: '🌟',
      points: Math.floor(Math.random() * 800) + 1200,
      versesToday: Math.floor(Math.random() * 20) + 10,
      streakDays: Math.floor(Math.random() * 7) + 2,
      accuracy: 95,
      rank: friends.length + 1,
      badge: 'رفيق الحفظ',
      lastActive: 'الآن'
    };

    const updated = [...friends, newFriend];
    saveFriends(updated);
    setShowAddFriend(false);
    setFriendNameInput('');
    onRefresh();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-semibold">
            <Trophy className="w-3.5 h-3.5" />
            <span>وفي ذلك فليتنافس المتنافسون</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-serif">
            حلقة التنافس ومسابقة الأصدقاء
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
            الصحبة الصالحة تشحذ الهمم وتعين على الاستمرار في تعاهد القرآن. نافس أصدقاءك في حفظ ومراجعة الآيات، واجمع الحسنات، وتصدر لوحة الشرف الأسبوعية.
          </p>
        </div>
      </div>

      {/* Podium Top 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        {sortedFriends.slice(0, 3).map((user, idx) => {
          const isFirst = idx === 0;
          const isSecond = idx === 1;
          const isThird = idx === 2;

          return (
            <div
              key={user.id}
              className={`bg-white rounded-3xl p-5 border text-center flex flex-col items-center justify-between relative shadow-xs ${
                isFirst 
                  ? 'border-amber-400 bg-gradient-to-b from-amber-50/50 to-white ring-2 ring-amber-300 sm:-translate-y-2' 
                  : 'border-stone-200'
              }`}
            >
              {isFirst && (
                <div className="absolute -top-3.5 bg-amber-500 text-white p-1 rounded-full shadow-md">
                  <Crown className="w-5 h-5" />
                </div>
              )}

              <div className="space-y-3 w-full">
                <div className="relative inline-block mt-2">
                  <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center text-3xl shadow-inner border border-stone-200">
                    {user.avatar}
                  </div>
                  <span className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs ${
                    isFirst ? 'bg-amber-500' : isSecond ? 'bg-stone-500' : 'bg-amber-700'
                  }`}>
                    {user.rank}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-stone-900 text-sm">{user.name}</h3>
                  <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-md">
                    {user.badge}
                  </span>
                </div>
              </div>

              <div className="w-full mt-4 pt-3 border-t border-stone-100 space-y-1.5 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>الحسنات والنقاط</span>
                  <span className="font-bold text-stone-900">{user.points.toLocaleString('ar-EG')}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>آيات اليوم</span>
                  <span className="font-semibold text-emerald-700">{user.versesToday} آية</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>التتابع</span>
                  <span className="font-semibold text-amber-600 flex items-center gap-0.5">
                    <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    {user.streakDays} أيام
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily Quran Challenges */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-700" />
            <h2 className="text-lg font-bold text-stone-900">
              تحديات التسميع اليومية
            </h2>
          </div>
          <span className="text-xs text-stone-500">تتجدد يومياً لنيل نقاط وحسنات إضافية</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {challenges.map((challenge) => (
            <div
              key={challenge.id}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-3 hover:border-emerald-300 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                    +{challenge.rewardPoints} نقطة
                  </span>
                  <span className="text-stone-500">{challenge.difficulty}</span>
                </div>
                <h3 className="font-bold text-stone-900 text-sm leading-snug">
                  {challenge.title}
                </h3>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-stone-100 text-xs">
                <span className="text-stone-500">ينتهي خلال {challenge.expiresInHours} ساعة</span>
                <button
                  onClick={() => onStartChallenge(challenge)}
                  className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>بدء التحدي</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Friends Ranking Table & Interactive Encouragements */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-stone-900">
              ترتيب حلقة الحفظ والأصدقاء
            </h2>
          </div>

          <button
            onClick={() => setShowAddFriend(true)}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة صديق للحلقة</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-100">
              <tr>
                <th className="py-3 px-4">الترتيب</th>
                <th className="py-3 px-4">المتسابق</th>
                <th className="py-3 px-4">النقاط والحسنات</th>
                <th className="py-3 px-4">آيات اليوم</th>
                <th className="py-3 px-4">التتابع</th>
                <th className="py-3 px-4">دقة التسميع</th>
                <th className="py-3 px-4">تشجيع أخوي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sortedFriends.map((friend) => {
                const isMe = friend.id === 'f_me';

                return (
                  <tr
                    key={friend.id}
                    className={`hover:bg-stone-50/80 transition-colors ${
                      isMe ? 'bg-emerald-50/40 font-semibold' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-bold text-stone-700">
                      #{friend.rank}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{friend.avatar}</span>
                        <div>
                          <div className="font-bold text-stone-900">{friend.name}</div>
                          <span className="text-[11px] text-stone-500 font-normal">
                            {friend.lastActive}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-emerald-800 text-sm">
                      {friend.points.toLocaleString('ar-EG')}
                    </td>

                    <td className="py-3.5 px-4 text-stone-700">
                      {friend.versesToday} آية
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                        <Flame className="w-3.5 h-3.5 fill-amber-500" />
                        {friend.streakDays} أيام
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-emerald-700">
                      {friend.accuracy}%
                    </td>

                    <td className="py-3.5 px-4">
                      {isMe ? (
                        <span className="text-[11px] text-stone-400">حسابك الحالي</span>
                      ) : sentCheers[friend.id] ? (
                        <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-md animate-fade-in">
                          {sentCheers[friend.id]}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSendCheer(friend.id, 'بارك الله في همتك! 🌟')}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                          >
                            تشجيع 👏
                          </button>
                          <button
                            onClick={() => handleSendCheer(friend.id, 'تنافس على الخير! 🌿')}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-[11px] transition-colors"
                          >
                            دعاء 🤲
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Friend */}
      {showAddFriend && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-stone-900 text-base">
              إضافة رفيق إلى حلقة التنافس
            </h3>
            <p className="text-xs text-stone-500">
              أدخل اسم الصديق أو رمز المشاركة الخاص به للتنافس معاً.
            </p>

            <form onSubmit={handleAddFriend} className="space-y-3 text-xs">
              <input
                type="text"
                required
                placeholder="اسم الصديق (مثال: عبدالله الراجحي)"
                value={friendNameInput}
                onChange={(e) => setFriendNameInput(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3 text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddFriend(false)}
                  className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer"
                >
                  إضافة ومنافسة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
