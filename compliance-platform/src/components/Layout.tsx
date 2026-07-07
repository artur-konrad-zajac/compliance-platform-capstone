import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { User, CheckCircle, LogOut, Settings, Menu, X, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, setRole, resetApp, hasUnsavedChanges, setHasUnsavedChanges } = useAppContext();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  React.useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  const getRoleIcon = () => {
    switch (role) {
      case 'customer': return <User className="w-5 h-5" />;
      case 'validator': return <CheckCircle className="w-5 h-5" />;
      case 'builder': return <Settings className="w-5 h-5" />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6] dark:bg-[#0A0A0B] transition-colors duration-300">
      
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm z-[9998] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ x: isSidebarOpen ? 0 : -300 }}
        className="fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 dark:bg-[#1C1C1E] dark:border-[#27272A] flex flex-col justify-between z-[9999] lg:relative lg:translate-x-0 lg:!transform-none lg:my-4 lg:ml-4 lg:rounded-2xl lg:border lg:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] lg:h-[calc(100vh-2rem)]"
      >
        <div className="flex flex-col h-full">
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 dark:border-[#27272A] shrink-0">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                Compliance <span className="text-[#4A2E1B] dark:text-[#8D6E63]">Platform</span>
              </h1>
            </div>
            <button className="lg:hidden text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200" onClick={() => setIsSidebarOpen(false)}>
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <nav className="space-y-1">
              <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 px-2">Navigation</h3>
              {(['customer', 'validator', 'builder'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    if (role === 'builder' && hasUnsavedChanges) {
                      if (!window.confirm("You have unpublished changes in the Form Builder. Are you sure you want to leave without publishing?")) {
                        return;
                      }
                      setHasUnsavedChanges(false);
                    }
                    setRole(r); 
                    setIsSidebarOpen(false); 
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                    role === r 
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30' 
                      : 'hover:bg-gray-50 dark:hover:bg-[#1C1C1E] text-gray-600 dark:text-gray-400'
                  }` }
                >
                  {r === 'customer' && <User className="w-5 h-5" />}
                  {r === 'validator' && <CheckCircle className="w-5 h-5" />}
                  {r === 'builder' && <Settings className="w-5 h-5" />}
                  <span className="capitalize">
                    {r === 'builder' ? 'Form Builder' : 
                     r === 'validator' ? 'Compliance Reviewer' : 
                     r === 'customer' ? 'Applicant' : r}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="px-4 pb-4 mt-auto">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                <strong>Disclaimer:</strong> This application and agent code are in an experimental phase. The goal is to provide a proof-of-concept only.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-[#27272A] shrink-0 space-y-2">
          <button
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1C1C1E] rounded-xl transition-colors"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>

          <button 
            onClick={() => {
              if (window.confirm("Are you sure you want to reset all data? This action cannot be undone.")) {
                resetApp();
              }
            }}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Reset Data</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="h-16 flex items-center px-4 md:px-8 z-10 shrink-0 gap-4 mt-2 md:mt-4">
          <button 
            className="lg:hidden p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-slate-100 dark:bg-[#1C1C1E] rounded-lg"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center space-x-3 w-full">
            <div className="hidden sm:flex p-2 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-lg">
              {getRoleIcon()}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 capitalize">
                {role === 'builder' ? 'Form Builder Dashboard' : 
                 role === 'validator' ? 'Compliance Reviewer Dashboard' : 
                 role === 'customer' ? 'Applicant Dashboard' :
                 `${role} Dashboard`}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {role === 'customer' 
                  ? `Logged in as Applicant`
                  : `Logged in as ${role === 'validator' ? 'Compliance Reviewer' : role === 'builder' ? 'Form Builder' : role}`
                }
              </p>
            </div>
          </div>
        </header>

        <main id="main-scroll-container" className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
