# Setup Guide

This guide will help you set up the WhatsApp Status Handler project on your local machine. Follow these steps carefully to get your development environment ready.

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software
- **Node.js** (version 18.0 or higher)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js) or **yarn**
  - Verify npm: `npm --version`
  - Or install yarn: `npm install -g yarn`
- **Git** for version control
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify installation: `git --version`

### Optional Tools (Recommended)
- **VS Code** with extensions:
  - TypeScript and JavaScript Language Features
  - Prettier - Code formatter
  - ESLint
  - Prisma
  - Tailwind CSS IntelliSense
- **Postman** or **Insomnia** for API testing

## 🚀 Installation Steps

### 1. Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-username/whatsapp-status-handler.git

# Navigate to the project directory
cd whatsapp-status-handler
```

### 2. Install Dependencies

```bash
# Using npm
npm install

# Or using yarn
yarn install
```

This will install all the dependencies listed in `package.json`, including:
- Next.js framework
- React and React DOM
- TypeScript
- Prisma ORM
- Baileys WhatsApp library
- And many other dependencies

### 3. Environment Configuration

Create environment configuration files:

```bash
# Copy the example environment file
cp .env.example .env.local
```

Edit `.env.local` with your preferred text editor and configure the following variables:

```env
# Database Configuration
DATABASE_URL="file:./dev.db"

# NextJS Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Security Configuration
ENCRYPTION_KEY="your-32-character-encryption-key"
JWT_SECRET="your-jwt-secret-key"

# WhatsApp Configuration
WHATSAPP_SESSION_DIR="./sessions"
WHATSAPP_MEDIA_DIR="./media"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Development Settings
NODE_ENV="development"
LOG_LEVEL="debug"
```

### 4. Database Setup

Initialize the database using Prisma:

```bash
# Generate Prisma client
npm run db:generate

# Push the database schema (for development)
npm run db:push

# Or run migrations (for production-like setup)
npm run db:migrate
```

### 5. First Run

Start the development server:

```bash
# Start the development server
npm run dev

# Or with yarn
yarn dev
```

The application will be available at: **http://localhost:3000**

## 🔧 Development Tools Setup

### Database Management

Access Prisma Studio for database management:

```bash
# Open Prisma Studio
npm run db:studio
```

This opens a web interface at http://localhost:5555 to view and edit your database.

### Code Formatting

Set up code formatting:

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

### Linting

Run ESLint to check code quality:

```bash
# Run linter
npm run lint
```

## 📱 WhatsApp Connection Setup

### Initial Connection

1. **Start the Application**: Ensure the server is running (`npm run dev`)

2. **Navigate to Auth Page**: Go to http://localhost:3000/auth

3. **Scan QR Code**: 
   - Open WhatsApp on your phone
   - Go to **Settings → Linked Devices → Link a Device**
   - Scan the QR code displayed on the auth page

4. **Verify Connection**: 
   - You should see "Connected" status
   - The session will be saved for future use

### Session Management

- Sessions are stored in the `sessions/` directory
- Sessions persist between server restarts
- To reset connection, delete session files and reconnect

## 🧪 Testing the Setup

### Basic Functionality Test

1. **Authentication Test**:
   ```bash
   # Check connection status
   curl http://localhost:3000/api/auth/status
   ```

2. **WebSocket Test**:
   ```bash
   # Test WebSocket connection
   npm run test:websocket
   ```

3. **Database Test**:
   - Open Prisma Studio: `npm run db:studio`
   - Verify tables are created and accessible

### API Endpoints Test

Test core API endpoints:

```bash
# Health check
curl http://localhost:3000/api/health

# Authentication status
curl http://localhost:3000/api/auth/status

# Contacts (requires authentication)
curl http://localhost:3000/api/contacts
```

## 🗂 Project Structure

After setup, your project structure should look like this:

```
whatsapp-status-handler/
├── src/
│   ├── app/                 # Next.js app directory
│   ├── lib/                 # Core business logic
│   └── components/          # React components
├── docs/                    # Documentation
├── prisma/                  # Database schema and migrations
├── sessions/               # WhatsApp session files
├── media/                  # Media storage directory
├── .env.local             # Environment configuration
└── package.json           # Dependencies and scripts
```

## ⚡ Quick Development Commands

Here are the most commonly used commands during development:

```bash
# Development server
npm run dev

# Database operations
npm run db:generate      # Generate Prisma client
npm run db:push         # Push schema to database
npm run db:studio       # Open database GUI
npm run db:migrate      # Run migrations

# Code quality
npm run lint            # Check linting
npm run format          # Format code
npm run format:check    # Check formatting

# Testing
npm run test:websocket  # Test WebSocket functionality

# Build for production
npm run build
npm run start
```

## 🚨 Troubleshooting Common Issues

### Port Already in Use
If port 3000 is busy:
```bash
# Kill process on port 3000
npx kill-port 3000

# Or use a different port
PORT=3001 npm run dev
```

### Database Connection Issues
```bash
# Reset database
rm -f prisma/dev.db
npm run db:push
```

### WhatsApp Connection Problems
```bash
# Clear sessions and reconnect
rm -rf sessions/*
# Restart server and scan QR code again
```

### Node Modules Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables Not Loading
- Ensure `.env.local` exists in the root directory
- Check that variable names match exactly
- Restart the development server after changes

## 🎯 Next Steps

After successful setup:

1. **Read the Architecture Guide**: [../architecture/OVERVIEW.md](../architecture/OVERVIEW.md)
2. **Explore the API Documentation**: [../api/README.md](../api/README.md)
3. **Check the User Guide**: [../usage/USER_GUIDE.md](../usage/USER_GUIDE.md)
4. **Review Contributing Guidelines**: [../development/CONTRIBUTING.md](../development/CONTRIBUTING.md)

## 💡 Pro Tips for Junior Developers

1. **Use TypeScript**: The project is fully typed - take advantage of autocomplete and error checking
2. **Hot Reload**: Changes to code automatically reload the browser in development
3. **Database Changes**: Always run `npm run db:generate` after modifying Prisma schema
4. **Error Logs**: Check the terminal and browser console for helpful error messages
5. **Session Persistence**: WhatsApp sessions persist, so you won't need to scan QR repeatedly

## 🆘 Getting Help

If you encounter issues during setup:

1. Check the [Troubleshooting Guide](../TROUBLESHOOTING.md)
2. Review the error messages carefully
3. Search existing [GitHub Issues](../../issues)
4. Create a new issue with:
   - Your operating system and Node.js version
   - Complete error messages
   - Steps to reproduce the problem

---

**Congratulations! Your development environment is now ready. Time to start building awesome WhatsApp automation features!** 🎉