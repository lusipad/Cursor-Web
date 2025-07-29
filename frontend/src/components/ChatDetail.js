import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Avatar,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  CircularProgress,
  Alert,
  Grid
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Code as CodeIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  SmartToy as SmartToyIcon,
  AccessTime as AccessTimeIcon,
  Folder as FolderIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const ChatDetail = ({ sessionId, onClose }) => {
  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('html');

  useEffect(() => {
    if (sessionId) {
      loadChatDetail();
    }
  }, [sessionId]);

  const loadChatDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/history/chat/${sessionId}?force=true`);
      const data = await response.json();

      if (data.success) {
        setChat(data.data);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError(err.message || '加载聊天详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const response = await fetch(`/api/history/chat/${sessionId}/export?format=${format}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${sessionId}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setExportDialogOpen(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || '导出失败');
      }
    } catch (err) {
      setError(err.message || '导出失败');
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '未知时间';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    return formatDistanceToNow(new Date(timestamp), { locale: zhCN, addSuffix: true });
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    
    return (
      <Box key={index} mb={2}>
        <Box display="flex" alignItems="flex-start" gap={2}
          sx={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
        >
          <Avatar
            sx={{
              bgcolor: isUser ? 'primary.main' : 'secondary.main',
              width: 32,
              height: 32
            }}
          >
            {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
          </Avatar>
          <Box flex={1} maxWidth="70%">
            <Paper
              elevation={1}
              sx={{
                p: 2,
                bgcolor: isUser ? 'primary.light' : 'background.paper',
                color: isUser ? 'primary.contrastText' : 'text.primary'
              }}
            >
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" fontWeight="bold">
                  {isUser ? '你' : 'Cursor AI'}
                </Typography>
                <Typography variant="caption">
                  {formatTime(message.timestamp)}
                </Typography>
              </Box>
              <Typography variant="body2" whiteSpace="pre-wrap" sx={{ lineHeight: 1.6 }}>
                {message.content}
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Box>
    );
  };

  if (!sessionId) return null;

  return (
    <Box height="100vh" display="flex" flexDirection="column">
      {/* 头部 */}
      <Paper elevation={2} sx={{ p: 2, borderRadius: 0 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" gutterBottom>
              {chat?.title || '聊天详情'}
            </Typography>
            <Box display="flex" alignItems="center" gap={2}>
              {chat?.project && (
                <Chip
                  icon={<FolderIcon />}
                  label={chat.project.name}
                  variant="outlined"
                  size="small"
                />
              )}
              <Chip
                icon={<AccessTimeIcon />}
                label={`${chat?.messages?.length || 0} 条消息`}
                variant="outlined"
                size="small"
              />
              <Typography variant="caption" color="textSecondary">
                更新于: {chat?.lastModified ? formatRelativeTime(chat.lastModified) : ''}
              </Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadChatDetail}
              disabled={loading}
            >
              刷新
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => setExportDialogOpen(true)}
            >
              导出
            </Button>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </Paper>

      {/* 内容区域 */}
      <Box flex={1} overflow="auto" p={2} bgcolor="grey.50">
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <Alert severity="error" action={
              <Button color="inherit" onClick={loadChatDetail}>
                重试
              </Button>
            }>
              {error}
            </Alert>
          </Box>
        ) : !chat ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <Typography variant="h6" color="textSecondary">
              未找到聊天记录
            </Typography>
          </Box>
        ) : (
          <Box maxWidth="md" mx="auto">
            {chat.messages?.map(renderMessage)}
          </Box>
        )}
      </Box>

      {/* 导出对话框 */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)}>
        <DialogTitle>导出聊天记录</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            选择导出格式：
          </Typography>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <Button
              variant={exportFormat === 'html' ? 'contained' : 'outlined'}
              startIcon={<DescriptionIcon />}
              onClick={() => setExportFormat('html')}
              fullWidth
            >
              HTML格式（网页）
            </Button>
            <Button
              variant={exportFormat === 'json' ? 'contained' : 'outlined'}
              startIcon={<CodeIcon />}
              onClick={() => setExportFormat('json')}
              fullWidth
            >
              JSON格式（数据）
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>取消</Button>
          <Button 
            variant="contained" 
            onClick={() => handleExport(exportFormat)}
            disabled={!chat}
          >
            导出
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatDetail;