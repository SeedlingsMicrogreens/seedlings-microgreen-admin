// Placeholder client config so modules importing lib/firebase can load in tests.
// Nothing here talks to Firebase; tests that need Firestore pass a fake transaction.
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "seedlings-test";
