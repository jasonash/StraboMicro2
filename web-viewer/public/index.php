<?php
/**
 * File: index.php
 * Description: StraboMicro Viewer Login Helper
 *
 * @package    StraboSpot Web Site
 * @author     Jason Ash <jasonash@ku.edu>
 * @copyright  2025 StraboSpot
 * @license    https://opensource.org/licenses/MIT MIT License
 * @link       https://strabospot.org
 */

include("../prepare_connections.php");

SESSION_START();

$userpkey = $_SESSION['userpkey'];
if($userpkey == "") $userpkey = 999999;

$id = $_GET['p'];

$row = $db->get_row("select * from micro_projectmetadata where id = $id and (ispublic or userpkey=$userpkey)");

if($row->id == ""){
	echo "Error! Project not found.";
	exit();
}


include("microviewer.html");
