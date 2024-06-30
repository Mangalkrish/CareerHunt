import React, { useContext } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Context } from '../../main';

const Logout = () => {
  const { setIsAuthorized, setUser } = useContext(Context);

  const handleLogout = () => {
    setUser(null); // Clear user data from context or state
    setIsAuthorized(false); // Update authorization state

    // Optionally, clear any stored tokens or session information in cookies/local storage
    // Example: localStorage.removeItem('token');

    // Redirect to login or home page after logout
    return <Navigate to="/login" />;
  };

  return (
    <div>
      <button onClick={handleLogout}>Logout</button>
      <Link to="/">Home</Link> {/* Example link back to home page */}
    </div>
  );
};

export default Logout;
