import React, { useState, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  History as HistoryIcon,
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Chat as ChatIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import ChatList from './components/ChatList';
import ChatDetail from './components/ChatDetail';

// 创建主题
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#667eea',
    },
    secondary: {
      main: '#764ba2',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        },
      },
    },
  },
});

const drawerWidth = 240;

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [chatCount, setChatCount] = useState(0);
  const [activeView, setActiveView] = useState('chats');

  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleChatSelect = (sessionId) => {
    setSelectedChatId(sessionId);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedChatId(null);
  };

  const handleChatCountUpdate = (count) => {
    setChatCount(count);
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Cursor历史记录
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        <ListItem button selected={activeView === 'chats'} onClick={() => setActiveView('chats')}>
          <ListItemIcon>
            <HistoryIcon />
          </ListItemIcon>
          <ListItemText primary="聊天记录" />
          <Chip label={chatCount} size="small" />
        </ListItem>
        
        <ListItem button>
          <ListItemIcon>
            <DashboardIcon />
          </ListItemIcon>
          <ListItemText primary="工作台" />
        </ListItem>
        
        <ListItem button>
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText primary="设置" />
        </ListItem>
      </List>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        <AppBar
          position="fixed"
          sx={{
            width: { md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: `${drawerWidth}px` },
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div">
              Cursor 聊天记录浏览器
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              icon={<ChatIcon />}
              label={`${chatCount} 条记录`}
              variant="outlined"
              color="primary"
            />
          </Toolbar>
        </AppBar>
        
        <Box
          component="nav"
          sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
        >
          <Drawer
            variant={isMobile ? 'temporary' : 'permanent'}
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{
              keepMounted: true,
            }}
            sx={{
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
              },
            }}
          >
            {drawer}
          </Drawer>
        </Box>
        
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { md: `calc(100% - ${drawerWidth}px)` },
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Toolbar />
          
          <Box flex={1} overflow="hidden">
            {selectedChatId ? (
              <ChatDetail
                sessionId={selectedChatId}
                onClose={handleCloseDetail}
              />
            ) : (
              <ChatList
                onChatSelect={handleChatSelect}
                onCountUpdate={handleChatCountUpdate}
              />
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;