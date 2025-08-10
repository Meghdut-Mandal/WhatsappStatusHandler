/**
 * Feedback API Endpoint
 * Week 4 - Developer C Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { errorHandler, ErrorCategory, ErrorSeverity } from '@/lib/errors/ErrorHandler';

export interface FeedbackData {
  type: 'bug' | 'feature' | 'general' | 'compliment';
  title: string;
  description: string;
  email?: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  attachScreenshot?: boolean;
  userAgent: string;
  url: string;
  timestamp: Date;
}

/**
 * POST /api/feedback - Submit user feedback
 */
export async function POST(request: NextRequest) {
  try {
    const feedback: FeedbackData = await request.json();

    // Validate required fields
    if (!feedback.title?.trim() || !feedback.description?.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Title and description are required'
      }, { status: 400 });
    }

    // Add server-side data
    const feedbackEntry = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...feedback,
      timestamp: new Date().toISOString(),
      serverTimestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      status: 'new'
    };

    // Save to file (in production, you'd save to a database)
    const feedbackDir = path.join(process.cwd(), 'data', 'feedback');
    await fs.mkdir(feedbackDir, { recursive: true });
    
    const feedbackFile = path.join(feedbackDir, `${feedbackEntry.id}.json`);
    await fs.writeFile(feedbackFile, JSON.stringify(feedbackEntry, null, 2));

    // Also append to a log file for easy reading
    const logFile = path.join(feedbackDir, 'feedback.log');
    const logEntry = `[${feedbackEntry.serverTimestamp}] ${feedback.type.toUpperCase()} - ${feedback.title} (${feedback.priority})\n`;
    await fs.appendFile(logFile, logEntry);

    // In a real application, you might want to:
    // - Send email notifications for high priority feedback
    // - Create tickets in your issue tracking system
    // - Send to analytics/monitoring services

    console.log(`New ${feedback.type} feedback received: ${feedback.title}`);

    return NextResponse.json({
      success: true,
      message: 'Feedback submitted successfully',
      feedbackId: feedbackEntry.id
    });

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'FeedbackAPI', action: 'submit_feedback' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to submit feedback',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}

/**
 * GET /api/feedback - Get feedback statistics (for admin use)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminKey = searchParams.get('adminKey');
    
    // Simple admin authentication (in production, use proper auth)
    if (adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const feedbackDir = path.join(process.cwd(), 'data', 'feedback');
    
    try {
      const files = await fs.readdir(feedbackDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      const feedbackItems = await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const content = await fs.readFile(path.join(feedbackDir, file), 'utf8');
            return JSON.parse(content);
          } catch (error) {
            return null;
          }
        })
      );

      const validFeedback = feedbackItems.filter(item => item !== null);
      
      // Calculate statistics
      const stats = {
        total: validFeedback.length,
        byType: {
          bug: validFeedback.filter(f => f.type === 'bug').length,
          feature: validFeedback.filter(f => f.type === 'feature').length,
          general: validFeedback.filter(f => f.type === 'general').length,
          compliment: validFeedback.filter(f => f.type === 'compliment').length
        },
        byPriority: {
          low: validFeedback.filter(f => f.priority === 'low').length,
          medium: validFeedback.filter(f => f.priority === 'medium').length,
          high: validFeedback.filter(f => f.priority === 'high').length
        },
        recent: validFeedback
          .sort((a, b) => new Date(b.serverTimestamp).getTime() - new Date(a.serverTimestamp).getTime())
          .slice(0, 10)
          .map(f => ({
            id: f.id,
            type: f.type,
            title: f.title,
            priority: f.priority,
            timestamp: f.serverTimestamp,
            status: f.status
          }))
      };

      return NextResponse.json({
        success: true,
        stats
      });
      
    } catch (error) {
      // Directory doesn't exist or is empty
      return NextResponse.json({
        success: true,
        stats: {
          total: 0,
          byType: { bug: 0, feature: 0, general: 0, compliment: 0 },
          byPriority: { low: 0, medium: 0, high: 0 },
          recent: []
        }
      });
    }

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'FeedbackAPI', action: 'get_stats' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to get feedback statistics',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}
