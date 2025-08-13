#!/usr/bin/env node

/**
 * Test script for new user_profiles table
 * Run with: node test-new-table.js
 */

require('dotenv').config();

const { 
  saveUserProfile, 
  getUserProfile, 
  getUserTokens
} = require('./users');

console.log('🧪 Testing New Table Setup...\n');

// Mock data for testing
const mockUserId = 'test_user_new_table';
const mockStravaUser = {
  id: mockUserId,
  username: 'test_new_athlete',
  firstname: 'New',
  lastname: 'User',
  city: 'Test City',
  state: 'CA',
  country: 'USA',
  sex: 'M',
  premium: false,
  profile: 'https://avatar.example.com/new.jpg'
};

const mockTokens = {
  access_token: 'new_test_access_token',
  refresh_token: 'new_test_refresh_token',
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  scope: 'read,activity:read_all'
};

async function testNewTable() {
  try {
    console.log('1. Testing new table profile creation...');
    
    await saveUserProfile(mockUserId, mockStravaUser, mockTokens, {
      preferences: { theme: 'dark' },
      settings: { notifications: true },
      subscription_tier: 'free'
    });
    console.log('✅ User profile saved to new table');

    console.log('\n2. Testing profile retrieval...');
    const profile = await getUserProfile(mockUserId);
    if (profile) {
      console.log('✅ User profile retrieved successfully');
      console.log('📋 Profile data:', {
        id: profile.user_id,
        username: profile.profile.username,
        preferences: profile.preferences,
        settings: profile.settings
      });
    } else {
      console.log('❌ Profile retrieval failed');
    }

    console.log('\n3. Testing token retrieval...');
    const tokens = await getUserTokens(mockUserId);
    if (tokens) {
      console.log('✅ User tokens retrieved successfully');
      console.log('📋 Token info:', {
        expires_at: tokens.expires_at,
        scope: tokens.scope
      });
    } else {
      console.log('❌ Token retrieval failed');
    }

    console.log('\n🎉 New table tests completed successfully!');
    
  } catch (error) {
    console.error('❌ New table test failed:', error.message);
    console.log('\n📋 If you see "ValidationException", make sure:');
    console.log('   - The user_profiles table exists');
    console.log('   - The table has PK and SK as composite keys');
    console.log('   - AWS credentials are configured');
  }
}

testNewTable();