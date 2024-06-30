import React from "react";
import { FaUserPlus } from "react-icons/fa";
import { MdFindInPage } from "react-icons/md";
import { IoMdSend } from "react-icons/io";

const HowItWorks = () => {
  return (
    <>
      <div className="howitworks">
        <div className="container">
          <h3>How CareerHunt Works</h3>
          <div className="banner">
            <div className="card">
              <FaUserPlus />  
              <p>Create Account</p>
              <p>
                Join CareerHunt today and unlock access to thousands of job listings, personalized recommendations, and exclusive resources to advance your career.
              </p>
            </div>
            <div className="card">
              <MdFindInPage />
              <p>Find a Job/Post a Job</p>
              <p>
                Whether you're searching for your dream job or looking to hire top talent, CareerHunt provides the tools and platform to meet your needs.
              </p>
            </div>
            <div className="card">
              <IoMdSend />
              <p>Apply For Job/Recruit Suitable Candidates</p>
              <p>
                Streamline your job application process with CareerHunt’s easy-to-use platform, or find and recruit the best candidates for your company efficiently.
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default HowItWorks;
