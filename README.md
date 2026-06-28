# SAWAARI - Auto Rickshaw Booking Platform (Monorepo)

Welcome to **SAWAARI**, a premium mobility platform designed exclusively for Auto Rickshaws.

---

## Repository Structure

This is an `npm workspaces` monorepo containing:
* `sawaari-frontend/`: Next.js Web App (Tailwind CSS, Leaflet Maps, Socket.IO Client).
* `sawaari-backend/`: NestJS Backend API (PostgreSQL + PostGIS, Redis Cache, Sockets.IO Server).

---

## Quick Start Setup (VS Code)

Follow these simple steps to run the application locally:

### 1. Run the Setup Script
Ensure **Docker Desktop** is running on your machine. Then, clone the repository, open the folder in your terminal, and run:
```bash
# Make the setup script executable and run it
chmod +x setup.sh && ./setup.sh
```
This script will automatically:
1. Copy the `.env.example` templates to `.env` (backend) and `.env.local` (frontend).
2. Start PostgreSQL (PostGIS) and Redis Docker containers.
3. Clean and install all npm dependencies.

---

### 2. Start the Development Servers

Run the following commands in separate terminal windows:

#### Start Backend Server
```bash
npm run dev:backend
```
The NestJS server will start on [http://localhost:3001/api](http://localhost:3001/api).

#### Start Frontend Web App
```bash
npm run dev:frontend
```
The Next.js application will start on [http://localhost:3000](http://localhost:3000).

---

## Features Implemented
* **Real-time Ride Offer Overlay**: Centered, dimmed overlay backdrop (`z-[9998]`/`z-[9999]`) resolving Leaflet map layering issues. Displays Pickup/Destination address, Estimated Earning, Distance, Travel Time (ETA), and Countdown timer.
* **Auto Driver Activation Bypass**: In dev/bypass mode, mock drivers (UID starting with `uid-`) automatically activate to `active` and have all 5 documents approved upon profile load, avoiding approval blocks.
* **Socket and GPS sync**: Geolocation watch positioning and immediate broadcasting synchronized with socket status. Allows manual map click simulation.
* **End-to-End Simulation**: Built-in verification testing in `/testing` page.
