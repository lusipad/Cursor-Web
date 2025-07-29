import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  CircularProgress,
  Alert,
  Button,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Description as DescriptionIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Folder as FolderIcon,
  Chat as ChatIcon,
  AccessTime as AccessTimeIcon,
  Launch as LaunchIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const ChatList = ({ onChatSelect }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupedChats, setGroupedChats] = useState({});
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    const grouped = groupChatsByProject();
    setGroupedChats(grouped);
  }, [chats, searchQuery]);

  const loadChats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/history/chats');
      const data = await response.json();
      
      if (data.success) {
        setChats(data.data || []);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError(err.message || '加载聊天记录失败');
    } finally {
      setLoading(false);
    }
  };

  const groupChatsByProject = () => {
    const filtered = chats.filter(chat => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        chat.title?.toLowerCase().includes(query) ||
        chat.project?.name?.toLowerCase().includes(query) ||
        chat.preview?.toLowerCase().includes(query)
      );
    });

    const groups = {};
    filtered.forEach(chat => {
      const projectName = chat.project?.name || 'Unknown Project';
      if (!groups[projectName]) {
        groups[projectName] = {
          name: projectName,
          path: chat.project?.rootPath || '',
          chats: []
        };
      }
      groups[projectName].chats.push(chat);
    });

    // 按最后修改时间排序
    Object.values(groups).forEach(group => {
      group.chats.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    });

    return groups;
  };

  const handleProjectToggle = (projectName) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectName)) {
      newExpanded.delete(projectName);
    } else {
      newExpanded.add(projectName);
    }
    setExpandedProjects(newExpanded);
  };

  const handleExport = async (sessionId, format = 'html') => {
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
      }
    } catch (err) {
      console.error('导出失败:', err);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '未知时间';
    return formatDistanceToNow(new Date(timestamp), { locale: zhCN, addSuffix: true });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" action={
          <Button color="inherit" onClick={loadChats}>
            重试
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  const projectEntries = Object.entries(groupedChats);

  return (
    <Box p={2}>
      {/* 搜索栏 */}
      <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="搜索聊天记录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <IconButton onClick={loadChats} title="刷新">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* 项目分组 */}
      {projectEntries.length === 0 ? (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="textSecondary">
            没有找到聊天记录
          </Typography>
          <Typography variant="body2" color="textSecondary">
            请确保Cursor中有聊天数据
          </Typography>
        </Box>
      ) : (
        projectEntries.map(([projectName, group]) => (
          <Accordion
            key={projectName}
            expanded={expandedProjects.has(projectName)}
            onChange={() => handleProjectToggle(projectName)}
            sx={{ mb: 1 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={1}>
                <FolderIcon color="primary" />
                <Typography variant="h6">{projectName}</Typography>
                <Typography variant="body2" color="textSecondary">
                  ({group.chats.length} 条记录)
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {group.path}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {group.chats.map((chat) => (
                  <Grid item xs={12} sm={6} md={4} key={chat.sessionId}>
                    <Card 
                      elevation={2}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': { 
                          boxShadow: 4,
                          transform: 'translateY(-2px)',
                          transition: 'all 0.2s ease-in-out'
                        }
                      }}
                      onClick={() => onChatSelect(chat.sessionId)}
                    >
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="start">
                          <Box flex={1}>
                            <Typography variant="h6" gutterBottom>
                              {chat.title || '未命名对话'}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" paragraph>
                              {chat.preview || '暂无消息'}
                            </Typography>
                            <Box display="flex" alignItems="center" gap={1}>
                              <AccessTimeIcon fontSize="small" />
                              <Typography variant="caption">
                                {formatTime(chat.lastModified)}
                              </Typography>
                              <Chip 
                                label={`${chat.messages?.length || 0} 条消息`} 
                                size="small" 
                                variant="outlined"
                              />
                            </Box>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExport(chat.sessionId);
                            }}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Box>
  );
};

export default ChatList;