# Hire3x Marketing Budget Tracker

## Deploy to Vercel (free, no domain needed)
1. Unzip this folder
2. In the folder, run:  npx vercel
   (log in when prompted, accept the defaults)
3. Run:  npx vercel --prod
4. You get a live https://<name>.vercel.app URL

## Run locally
npm install
npm run dev

### Firebase emulators
The Firestore emulator runs on the JVM, so `java` must be on your PATH before
`npm run emulators`, `npm run test:rules`, or `npm run bootstrap:emulator`.
On macOS with Homebrew: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

Start the emulators in one terminal, then seed the three super-admins in another:

    npm run emulators
    npm run bootstrap:emulator

Re-running the bootstrap repairs claims and profiles without touching existing
passwords. Pass `--reset-passwords` to issue fresh temporary ones.

Data is saved in the browser (localStorage) on whichever device you use it.
