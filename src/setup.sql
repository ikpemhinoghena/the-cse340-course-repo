CREATE TABLE organization (
organization_id SERIAL PRIMARY KEY,
name VARCHAR(150) NOT NULL,
description TEXT NOT NULL,
contact_email VARCHAR(255) NOT NULL,
logo_filename VARCHAR(255) NOT NULL
);

INSERT INTO organization (name, description, contact_email, logo_filename)
VALUES
('BrightFuture Builders', 'A nonprofit focused on improving community infrastructure through sustainable construction projects.', 'info@brightfuturebuilders.org', 'brightfuture-logo.png'),
('GreenHarvest Growers', 'An urban farming collective promoting food sustainability and education in local neighborhoods.', 'contact@greenharvest.org', 'greenharvest-logo.png'),
('UnityServe Volunteers', 'A volunteer coordination group supporting local charities and service initiatives.', 'hello@unityserve.org', 'unityserve-logo.png');

CREATE TABLE service_project (
project_id SERIAL PRIMARY KEY,
organization_id INTEGER NOT NULL,
title VARCHAR(150) NOT NULL,
description TEXT NOT NULL,
location VARCHAR(255) NOT NULL,
date DATE NOT NULL,
CONSTRAINT fk_service_project_organization
FOREIGN KEY (organization_id)
REFERENCES organization(organization_id)
);

INSERT INTO service_project (organization_id, title, description, location, date)
VALUES
(1, 'Community Center Renovation', 'Renovate and improve a local community center for residents.', 'Benin City', '2026-10-03'),
(1, 'School Classroom Repair', 'Repair damaged classrooms and improve the learning environment.', 'Benin City', '2026-10-10'),
(1, 'Public Playground Restoration', 'Restore playground facilities for children in the community.', 'Benin City', '2026-10-17'),
(1, 'Community Shelter Improvement', 'Improve a local shelter through basic repairs and maintenance.', 'Benin City', '2026-10-24'),
(1, 'Neighborhood Walkway Project', 'Repair and improve pedestrian walkways in a local neighborhood.', 'Benin City', '2026-10-31'),

(2, 'Community Garden Planting', 'Plant vegetables and maintain a community garden.', 'Benin City', '2026-11-07'),
(2, 'Urban Farming Workshop', 'Teach community members basic urban farming techniques.', 'Benin City', '2026-11-14'),
(2, 'School Garden Project', 'Create a small educational garden for a local school.', 'Benin City', '2026-11-21'),
(2, 'Food Sustainability Workshop', 'Teach sustainable food-growing and food-use practices.', 'Benin City', '2026-11-28'),
(2, 'Neighborhood Tree Planting', 'Plant trees and improve green spaces in the community.', 'Benin City', '2026-12-05'),

(3, 'Community Food Drive', 'Collect and distribute food to families in need.', 'Benin City', '2026-12-12'),
(3, 'Charity Clothing Drive', 'Collect clothing donations for local charities and families.', 'Benin City', '2026-12-19'),
(3, 'Neighborhood Cleanup', 'Organize volunteers to clean public areas in the community.', 'Benin City', '2027-01-09'),
(3, 'Senior Support Day', 'Provide practical assistance and companionship to senior residents.', 'Benin City', '2027-01-16'),
(3, 'Youth Service Day', 'Coordinate youth volunteers for several community service activities.', 'Benin City', '2027-01-23');
