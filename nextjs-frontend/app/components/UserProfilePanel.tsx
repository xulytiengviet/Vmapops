'use client';

import { useState } from 'react';
import { useUserProfile } from '@/app/hooks/useUserProfile';
import { User, Home, Building2, MapPin, X, Plus, Edit2, Trash2 } from 'lucide-react';

export function UserProfilePanel() {
  const userProfile = useUserProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [editingType, setEditingType] = useState<'home' | 'work' | 'favorite' | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [favoriteName, setFavoriteName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSavePlace = async (type: 'home' | 'work' | 'favorite') => {
    if (!addressInput.trim()) return;

    // Validate address isn't too vague (like just "Australia")
    const addressParts = addressInput.trim().split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (addressParts.length < 2) {
      alert('Please provide a more specific address (e.g., "123 Main St, City, State" or "301 King St, Melbourne VIC 3000, Australia")');
      return;
    }

    setIsSaving(true);
    try {
      // Geocode the address using the API
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressInput.trim() }),
      });

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        alert('Could not find that address. Please try a more specific address.');
        setIsSaving(false);
        return;
      }

      const place = data.results[0];
      
      // Additional validation - check if the result is too vague
      if (place.formattedAddress.split(',').length < 2) {
        alert('The address found is too vague. Please provide a more specific address.');
        setIsSaving(false);
        return;
      }

      const placeData = {
        name: type === 'favorite' ? favoriteName.trim() : (type === 'home' ? 'Home' : 'Work'),
        address: place.formattedAddress,
        location: place.location,
        placeId: place.placeId,
      };

      if (type === 'home') {
        userProfile.setHome(placeData);
      } else if (type === 'work') {
        userProfile.setWork(placeData);
      } else {
        userProfile.addFavorite(placeData);
      }

      setAddressInput('');
      setFavoriteName('');
      setEditingType(null);
    } catch (error) {
      console.error('Error saving place:', error);
      alert('Failed to save place. Please try again with a more specific address.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveFavorite = (id: string) => {
    if (confirm('Remove this favorite place?')) {
      userProfile.removeFavorite(id);
    }
  };

  return (
    <>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-all hover:shadow-md"
        title="Manage saved places"
      >
        <User className="w-4 h-4 text-gray-700" />
        <span className="text-sm font-medium text-gray-700">Profile</span>
        {(userProfile.home || userProfile.work || userProfile.favorites.length > 0) && (
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
        )}
      </button>

      {/* Slide-in Panel */}
      {isOpen && (
        <>
          {/* Backdrop - covers entire screen */}
          <div 
            className="fixed inset-0 bg-black/30 z-[60] transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Slide-in Panel - positioned to left of chat sidebar, slides from right */}
          <div 
            className={`fixed top-16 right-96 h-[calc(100vh-4rem)] w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col transition-transform duration-300 ease-out ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ maxWidth: 'min(28rem, calc(100vw - 384px - 2rem))' }}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Saved Places</h2>
                  <p className="text-xs text-blue-100">Manage your home, work, and favorites</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Home */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Home className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Home</h3>
                  </div>
                  {!userProfile.home && !editingType && (
                    <button
                      onClick={() => setEditingType('home')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  )}
                </div>
                {userProfile.home ? (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 mb-1">{userProfile.home.name}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{userProfile.home.address}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => {
                            setEditingType('home');
                            setAddressInput(userProfile.home!.address);
                          }}
                          className="text-gray-400 hover:text-blue-600 transition-colors p-1.5"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Remove home address?')) {
                              userProfile.removeHome();
                            }
                          }}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1.5"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : editingType === 'home' ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <input
                      type="text"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      placeholder="Enter your home address..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isSaving}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSavePlace('home')}
                        disabled={isSaving || !addressInput.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingType(null);
                          setAddressInput('');
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Work */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Work</h3>
                  </div>
                  {!userProfile.work && !editingType && (
                    <button
                      onClick={() => setEditingType('work')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  )}
                </div>
                {userProfile.work ? (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 mb-1">{userProfile.work.name}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{userProfile.work.address}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => {
                            setEditingType('work');
                            setAddressInput(userProfile.work!.address);
                          }}
                          className="text-gray-400 hover:text-blue-600 transition-colors p-1.5"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Remove work address?')) {
                              userProfile.removeWork();
                            }
                          }}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1.5"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : editingType === 'work' ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <input
                      type="text"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      placeholder="Enter your work address..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isSaving}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSavePlace('work')}
                        disabled={isSaving || !addressInput.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingType(null);
                          setAddressInput('');
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Favorites */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Favorites</h3>
                  </div>
                  {!editingType && (
                    <button
                      onClick={() => setEditingType('favorite')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  )}
                </div>
                
                {editingType === 'favorite' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <input
                      type="text"
                      value={favoriteName}
                      onChange={(e) => setFavoriteName(e.target.value)}
                      placeholder="Name (e.g., 'Gym', 'Coffee Shop')"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isSaving}
                    />
                    <input
                      type="text"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      placeholder="Enter address..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isSaving}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSavePlace('favorite')}
                        disabled={isSaving || !addressInput.trim() || !favoriteName.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingType(null);
                          setAddressInput('');
                          setFavoriteName('');
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {userProfile.favorites.length > 0 ? (
                  <div className="space-y-2">
                    {userProfile.favorites.map((fav) => (
                      <div key={fav.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start justify-between group hover:border-gray-300 transition-colors">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 mb-1">{fav.name}</p>
                          <p className="text-sm text-gray-600 leading-relaxed">{fav.address}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveFavorite(fav.id)}
                          className="ml-3 text-gray-400 hover:text-red-600 transition-colors p-1.5 opacity-0 group-hover:opacity-100"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : editingType !== 'favorite' && (
                  <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-200">
                    <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No favorites yet</p>
                    <p className="text-xs text-gray-400 mt-1">Add places you visit frequently!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                Saved places are stored locally and used for quick navigation
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
