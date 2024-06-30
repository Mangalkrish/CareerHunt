import React, { useContext } from "react";
import { Context } from "../../main";
import { Link } from "react-router-dom";
import { FaFacebookF, FaYoutube, FaLinkedin } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";

const Footer = () => {
  const { isAuthorized } = useContext(Context);
  return (
    <footer className={isAuthorized ? "footerShow" : "footerHide"}>
      <div>&copy; All Rights Reserved By Krish Mangal.</div>
      <div>
        <Link to={" "} target="_blank">
          <FaFacebookF />
        </Link>
        <Link to={" "} target="_blank">
          <FaYoutube />
        </Link>
        <Link to={"https://www.linkedin.com/in/krish-mangal-9a85a8261?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app"} target="_blank">
          <FaLinkedin />
        </Link>
        <Link to={"https://www.instagram.com/krish.mangal?utm_source=qr&igsh=MTV4cjFnZXJ5Z254Zg=="} target="_blank">
          <RiInstagramFill />
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
