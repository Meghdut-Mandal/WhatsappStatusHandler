# WhatsApp Status Handler

A powerful Next.js application for managing WhatsApp messaging automation, status updates, and media handling without compression. Built with modern web technologies and the Baileys WhatsApp Web API.

## 🎯 Overview

The WhatsApp Status Handler enables users to:
- **Upload media to WhatsApp Status** without compression
- **Bulk messaging** to contacts and groups
- **Contact management** with synchronization
- **Real-time monitoring** of message delivery
- **Secure authentication** via QR code scanning
- **Media processing** with original quality preservation

## ✨ Key Features

### Core Functionality
- 📱 **QR Code Authentication** - Secure WhatsApp Web connection
- 📤 **Uncompressed Media Upload** - Preserve original quality for photos/videos
- 📊 **Status Management** - Post to WhatsApp Status with multiple media
- 👥 **Contact Management** - Sync and organize WhatsApp contacts
- 📈 **Analytics Dashboard** - Track message delivery and engagement
- 🔄 **Real-time Updates** - WebSocket-based live status monitoring

### Advanced Features
- 🚀 **Bulk Messaging** - Send messages to multiple recipients
- ⏰ **Message Scheduling** - Schedule messages for future delivery
- 📁 **File Management** - Organize and manage uploaded media
- 🔒 **Security Features** - Encryption, rate limiting, audit logging
- 💾 **Backup & Restore** - Automated data backup functionality
- 🔌 **API Integration** - RESTful APIs for external systems

## 🛠 Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Node.js, Next.js API Routes, WebSockets
- **Database**: SQLite with Prisma ORM
- **WhatsApp**: @whiskeysockets/baileys library
- **Media**: QR code generation, file streaming, compression handling
- **Development**: ESLint, Prettier, TypeScript strict mode

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm, yarn, or pnpm

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-status-handler
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up the database**
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### First Time Setup

1. Go to `/auth` to authenticate with WhatsApp
2. Scan the QR code with your WhatsApp mobile app
3. Wait for the "Connected to Bot" confirmation message
4. Start uploading media and managing your WhatsApp content

## 📖 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run format` - Format code with Prettier
- `npm run test:websocket` - Test WebSocket connections

## 🏗 Project Structure

```
whatsapp-status-handler/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/             # Main application pages
│   │   │   ├── auth/          # Authentication pages
│   │   │   ├── dashboard/     # Main dashboard
│   │   │   ├── upload/        # Media upload interface
│   │   │   ├── contacts/      # Contact management
│   │   │   └── history/       # Message history
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   ├── upload/        # File upload handling
│   │   │   ├── send/          # Message sending
│   │   │   └── contacts/      # Contact management
│   │   └── components/        # Reusable UI components
│   └── lib/                   # Utility libraries
│       ├── socketManager/     # Baileys WhatsApp integration
│       ├── db/               # Database utilities
│       └── uploader/         # File upload handling
├── prisma/
│   └── schema.prisma         # Database schema
├── data/                     # Local data storage
│   └── wa_sessions.sqlite    # SQLite database
├── docs/                     # Comprehensive documentation
└── scripts/                  # Utility scripts
```

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="file:./data/wa_sessions.sqlite"

# Application
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Security (optional)
ENCRYPTION_KEY="your-encryption-key"
```

### Database Setup
The application uses SQLite with Prisma ORM. The database includes:
- **Sessions**: WhatsApp authentication data
- **SendHistory**: Message delivery tracking
- **MediaMeta**: File metadata and storage info

## 📱 Usage

### Authentication
1. Navigate to `/auth`
2. Scan the displayed QR code with WhatsApp
3. Wait for connection confirmation
4. You're ready to use the application

### Uploading Media
1. Go to `/upload`
2. Drag and drop files or click to select
3. Choose to send as Status or to specific contacts
4. Add captions if desired
5. Send with original quality preserved

### Managing Contacts
1. Visit `/contacts` to view synced contacts
2. Organize contacts into groups
3. Send bulk messages to selected contacts
4. Track message delivery status

## 🔒 Security Features

- **Local-first architecture** - All data stays on your machine
- **Encrypted session storage** - WhatsApp credentials are encrypted
- **Rate limiting** - Prevents API abuse
- **Audit logging** - Track all system activities
- **Secure file handling** - Temporary files are cleaned up automatically

## 📊 Monitoring & Analytics

- **Real-time dashboard** - Monitor connection status and activity
- **Message analytics** - Track delivery rates and engagement
- **Performance metrics** - System health and performance monitoring
- **WebSocket updates** - Live status updates without page refresh

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/development/CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📚 Documentation

Comprehensive documentation is available in the `/docs` directory:
- [Setup Guide](./docs/getting-started/SETUP.md)
- [Architecture Overview](./docs/architecture/OVERVIEW.md)
- [API Documentation](./docs/api/README.md)
- [User Guide](./docs/usage/USER_GUIDE.md)

## 🐛 Troubleshooting

### Common Issues
- **QR Code not generating**: Check WebSocket connection
- **Files not uploading**: Verify file size limits and formats
- **Connection lost**: Restart the application and re-authenticate

For more help, see [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)

## 📄 License

This project is private and proprietary. All rights reserved.

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Next.js](https://nextjs.org) - React framework
- [Prisma](https://prisma.io) - Database toolkit
- [Tailwind CSS](https://tailwindcss.com) - CSS framework

---

**Built with ❤️ for seamless WhatsApp automation**
